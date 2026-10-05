// 主机端：接着物理键盘/鼠标的那台电脑。
// 监听 TCP 等待被控端连入（反向连接，可穿过被控端所在的 NAT），
// 安装全局低级键鼠钩子；按热键在「本地」与「远程」之间切换，
// 远程模式下吞掉本地输入、把它转发给被控端注入。
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class Host
{
    static TcpListener listener;
    static volatile NetworkStream stream;
    static readonly object sendLock = new object();
    static readonly object keysLock = new object();

    static volatile bool connected;   // 被控端是否在线
    static volatile bool remote;      // 当前是否处于远程模式
    static int connEpoch;             // 每次连接自增，用于让旧线程自然退出

    static int port = 15180;
    static uint hotkeyVk = 0x7B;      // F12
    static bool hkCtrl = true, hkAlt = true, hkShift = false, hkWin = false;
    static bool autoRemote;           // --remote：被控端一连上就切到远程模式
    static volatile bool swallowHotkeyUp;

    static readonly HashSet<ushort> downKeys = new HashSet<ushort>();
    static Native.POINT savedPos;
    static volatile int lastRecvTick;

    static Native.HookProc mouseProc, kbProc;
    static IntPtr mouseHook = IntPtr.Zero, kbHook = IntPtr.Zero;

    public static int Run(string[] args)
    {
        for (int i = 1; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "--port")
            {
                if (i + 1 >= args.Length || !int.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out port))
                { Console.WriteLine("[x] --port 需要一个端口号"); return 1; }
                i++;
            }
            else if (a == "--hotkey")
            {
                if (i + 1 >= args.Length || !ParseHotkey(args[i + 1])) { Console.WriteLine("[x] --hotkey 形如 ctrl+alt+f12"); return 1; }
                i++;
            }
            else if (a == "--remote") autoRemote = true;
            else { Console.WriteLine("[x] 未知参数: " + a); return 1; }
        }

        Console.WriteLine("MouseShare 主机端 0.1");
        Console.WriteLine("切换热键: " + HotkeyText());
        Console.WriteLine();
        foreach (string ip in LocalIPv4()) Console.WriteLine("本机可用地址: " + ip);
        listener = new TcpListener(IPAddress.Any, port);
        try { listener.Start(); }
        catch (Exception ex) { Console.WriteLine("[x] 无法监听 " + port + ": " + ex.Message); return 1; }
        Console.WriteLine("监听 0.0.0.0:" + port + "，等待被控端连接...");
        Console.WriteLine("在被控端运行:  MouseShare.exe agent --server <上面某个IP>:" + port);
        Console.WriteLine();

        lastRecvTick = Environment.TickCount;
        new Thread(ListenLoop) { IsBackground = true }.Start();
        new Thread(KeepAliveLoop) { IsBackground = true }.Start();

        mouseProc = MouseHook;
        kbProc = KeyboardHook;
        IntPtr hMod = Native.GetModuleHandle(null);
        mouseHook = Native.SetWindowsHookEx(Native.WH_MOUSE_LL, mouseProc, hMod, 0);
        kbHook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, kbProc, hMod, 0);
        if (mouseHook == IntPtr.Zero || kbHook == IntPtr.Zero)
        {
            Console.WriteLine("[x] 键鼠钩子安装失败，错误码 " + Marshal.GetLastWin32Error());
            return 1;
        }

        AppDomain.CurrentDomain.ProcessExit += delegate { Cleanup(); };
        Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e) { e.Cancel = false; Cleanup(); };

        Native.MSG msg;
        while (Native.GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
        {
            Native.TranslateMessage(ref msg);
            Native.DispatchMessage(ref msg);
        }
        Cleanup();
        return 0;
    }

    // ---------------- 网络 ----------------

    static void ListenLoop()
    {
        while (true)
        {
            TcpClient client = null;
            try
            {
                client = listener.AcceptTcpClient();
                client.NoDelay = true;
                client.SendTimeout = 200;   // 写阻塞超过 200ms 就报错，避免拖住低级钩子
                stream = client.GetStream();
                lastRecvTick = Environment.TickCount;
                int epoch = ++connEpoch;
                connected = true;
                Console.WriteLine("[host] 被控端已连接: " + client.Client.RemoteEndPoint + "  （按 " + HotkeyText() + " 切到远程）");
                if (autoRemote) EnterRemote();

                byte[] buf = new byte[512];
                while (connected && epoch == connEpoch)
                {
                    int n = stream.Read(buf, 0, buf.Length);
                    if (n <= 0) break;
                    lastRecvTick = Environment.TickCount;
                }
            }
            catch (Exception ex)
            {
                if (connected) Console.WriteLine("[host] 读取结束: " + ex.Message);
            }
            connected = false;
            ExitRemote("连接断开");
            try { if (client != null) client.Close(); } catch { }
            stream = null;
            Console.WriteLine("[host] 等待被控端重新连接...");
        }
    }

    static void KeepAliveLoop()
    {
        while (true)
        {
            Thread.Sleep(5000);
            if (!connected) continue;
            Send("P");
            if (unchecked(Environment.TickCount - lastRecvTick) > 12000)
            {
                Console.WriteLine("[host] 12 秒未收到被控端数据，判定链路已断");
                connected = false;
                CloseClient();
            }
        }
    }

    static void CloseClient()
    {
        try { NetworkStream s = stream; if (s != null) s.Close(); } catch { }
        stream = null;
    }

    static void Send(string line)
    {
        NetworkStream s = stream;
        if (!connected || s == null) return;
        try
        {
            byte[] bytes = Encoding.ASCII.GetBytes(line + "\n");
            lock (sendLock) { s.Write(bytes, 0, bytes.Length); }
        }
        catch { connected = false; }
    }

    // ---------------- 模式切换 ----------------

    static void Toggle()
    {
        if (remote) ExitRemote("热键切回");
        else EnterRemote();
    }

    static void EnterRemote()
    {
        if (!connected) { Console.WriteLine("[host] 被控端还没连上，无法切换"); return; }
        Native.GetCursorPos(out savedPos);
        lock (keysLock) downKeys.Clear();
        remote = true;
        Console.WriteLine("[host] >>> 远程模式：本地键鼠已接管并转发到被控端，再按一次 " + HotkeyText() + " 返回");
    }

    static void ExitRemote(string why)
    {
        if (!remote) return;
        List<ushort> pending;
        lock (keysLock)
        {
            pending = new List<ushort>(downKeys);
            downKeys.Clear();
        }
        foreach (ushort vk in pending) Send("K " + vk + " 0 " + Native.KEYEVENTF_KEYUP);
        remote = false;
        Native.SetCursorPos(savedPos.x, savedPos.y);
        Console.WriteLine("[host] <<< 本地模式（" + why + "）");
    }

    static void Cleanup()
    {
        ExitRemote("退出");
        try { if (mouseHook != IntPtr.Zero) Native.UnhookWindowsHookEx(mouseHook); } catch { }
        try { if (kbHook != IntPtr.Zero) Native.UnhookWindowsHookEx(kbHook); } catch { }
        mouseHook = kbHook = IntPtr.Zero;
        try { if (listener != null) listener.Stop(); } catch { }
        CloseClient();
    }

    // ---------------- 钩子 ----------------

    static IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode < 0 || !remote) return Native.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        if (!connected) { ExitRemote("连接断开"); return Native.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam); }

        Native.MSLLHOOKSTRUCT ms = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
        uint msg = unchecked((uint)wParam.ToInt64());

        switch (msg)
        {
            case Native.WM_MOUSEMOVE:
                SendMouseMove(ms.pt);
                break;
            case Native.WM_LBUTTONDOWN: SendMouse(Native.MOUSEEVENTF_LEFTDOWN, 0); break;
            case Native.WM_LBUTTONUP: SendMouse(Native.MOUSEEVENTF_LEFTUP, 0); break;
            case Native.WM_RBUTTONDOWN: SendMouse(Native.MOUSEEVENTF_RIGHTDOWN, 0); break;
            case Native.WM_RBUTTONUP: SendMouse(Native.MOUSEEVENTF_RIGHTUP, 0); break;
            case Native.WM_MBUTTONDOWN: SendMouse(Native.MOUSEEVENTF_MIDDLEDOWN, 0); break;
            case Native.WM_MBUTTONUP: SendMouse(Native.MOUSEEVENTF_MIDDLEUP, 0); break;
            case Native.WM_MOUSEWHEEL: SendMouse(Native.MOUSEEVENTF_WHEEL, unchecked((uint)(short)(ms.mouseData >> 16))); break;
            case Native.WM_MOUSEHWHEEL: SendMouse(Native.MOUSEEVENTF_HWHEEL, unchecked((uint)(short)(ms.mouseData >> 16))); break;
            case Native.WM_XBUTTONDOWN: SendMouse(Native.MOUSEEVENTF_XDOWN, ms.mouseData >> 16); break;
            case Native.WM_XBUTTONUP: SendMouse(Native.MOUSEEVENTF_XUP, ms.mouseData >> 16); break;
        }
        return (IntPtr)1;   // 吞掉事件，本地不再响应
    }

    static IntPtr KeyboardHook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode < 0) return Native.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);

        Native.KBDLLHOOKSTRUCT kb = (Native.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
        bool isDown = (kb.flags & Native.LLKHF_UP) == 0;

        if (kb.vkCode == hotkeyVk)
        {
            if (isDown && ModsDown())
            {
                swallowHotkeyUp = true;
                Toggle();
                return (IntPtr)1;
            }
            if (!isDown && swallowHotkeyUp)
            {
                swallowHotkeyUp = false;
                return (IntPtr)1;
            }
        }

        if (!remote) return Native.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        if (!connected) { ExitRemote("连接断开"); return Native.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam); }

        uint flags = (kb.flags & Native.LLKHF_EXTENDED) | (isDown ? 0u : Native.KEYEVENTF_KEYUP);
        lock (keysLock)
        {
            if (isDown) downKeys.Add((ushort)kb.vkCode);
            else downKeys.Remove((ushort)kb.vkCode);
        }
        Send("K " + kb.vkCode + " " + kb.scanCode + " " + flags);
        return (IntPtr)1;
    }

    static void SendMouse(uint flags, uint data)
    {
        Send("M " + flags + " 0 0 " + data);
    }

    static void SendMouseMove(Native.POINT pt)
    {
        int vx = Native.GetSystemMetrics(Native.SM_XVIRTUALSCREEN);
        int vy = Native.GetSystemMetrics(Native.SM_YVIRTUALSCREEN);
        int vw = Native.GetSystemMetrics(Native.SM_CXVIRTUALSCREEN);
        int vh = Native.GetSystemMetrics(Native.SM_CYVIRTUALSCREEN);
        if (vw < 2) vw = 2;
        if (vh < 2) vh = 2;

        long nx = (long)(pt.x - vx) * 65535 / (vw - 1);
        long ny = (long)(pt.y - vy) * 65535 / (vh - 1);
        if (nx < 0) nx = 0; else if (nx > 65535) nx = 65535;
        if (ny < 0) ny = 0; else if (ny > 65535) ny = 65535;

        uint flags = Native.MOUSEEVENTF_MOVE | Native.MOUSEEVENTF_ABSOLUTE | Native.MOUSEEVENTF_VIRTUALDESK;
        Send("M " + flags + " " + nx + " " + ny + " 0");
    }

    // ---------------- 热键 ----------------

    static bool ModsDown()
    {
        if (hkCtrl && !IsDown(Native.VK_CONTROL)) return false;
        if (hkAlt && !IsDown(Native.VK_MENU)) return false;
        if (hkShift && !IsDown(Native.VK_SHIFT)) return false;
        if (hkWin && !IsDown(Native.VK_LWIN) && !IsDown(Native.VK_RWIN)) return false;
        if (!hkCtrl && IsDown(Native.VK_CONTROL)) return false;
        if (!hkAlt && IsDown(Native.VK_MENU)) return false;
        if (!hkShift && IsDown(Native.VK_SHIFT)) return false;
        return true;
    }

    static bool IsDown(int vk)
    {
        return (Native.GetAsyncKeyState(vk) & 0x8000) != 0;
    }

    static bool ParseHotkey(string spec)
    {
        hkCtrl = hkAlt = hkShift = hkWin = false;
        foreach (string raw in spec.Split('+'))
        {
            string k = raw.Trim().ToLowerInvariant();
            switch (k)
            {
                case "ctrl": case "control": hkCtrl = true; break;
                case "alt": hkAlt = true; break;
                case "shift": hkShift = true; break;
                case "win": case "cmd": hkWin = true; break;
                default:
                    uint vk;
                    if (!TryParseVk(k, out vk)) { Console.WriteLine("[x] 无法识别的按键: " + raw); return false; }
                    hotkeyVk = vk;
                    break;
            }
        }
        return true;
    }

    static bool TryParseVk(string k, out uint vk)
    {
        vk = 0;
        if (k.Length == 1 && k[0] >= 'a' && k[0] <= 'z') { vk = (uint)char.ToUpperInvariant(k[0]); return true; }
        if (k.Length == 1 && k[0] >= '0' && k[0] <= '9') { vk = (uint)k[0]; return true; }
        if (k.Length >= 2 && k[0] == 'f')
        {
            int n;
            if (int.TryParse(k.Substring(1), NumberStyles.Integer, CultureInfo.InvariantCulture, out n) && n >= 1 && n <= 24)
            { vk = (uint)(0x70 + n - 1); return true; }
        }
        switch (k)
        {
            case "esc": vk = 0x1B; return true;
            case "space": vk = 0x20; return true;
            case "tab": vk = 0x09; return true;
            case "insert": vk = 0x2D; return true;
            case "delete": vk = 0x2E; return true;
            case "home": vk = 0x24; return true;
            case "end": vk = 0x23; return true;
            case "pause": vk = 0x13; return true;
            case "scroll": vk = 0x91; return true;
        }
        return false;
    }

    static string HotkeyText()
    {
        string s = "";
        if (hkCtrl) s += "Ctrl+";
        if (hkAlt) s += "Alt+";
        if (hkShift) s += "Shift+";
        if (hkWin) s += "Win+";
        if (hotkeyVk >= 0x70 && hotkeyVk <= 0x87) return s + "F" + (hotkeyVk - 0x70 + 1);
        if (hotkeyVk >= 'A' && hotkeyVk <= 'Z') return s + (char)hotkeyVk;
        if (hotkeyVk >= '0' && hotkeyVk <= '9') return s + (char)hotkeyVk;
        return s + "0x" + hotkeyVk.ToString("X2");
    }

    // ---------------- 杂项 ----------------

    static List<string> LocalIPv4()
    {
        List<string> list = new List<string>();
        try
        {
            foreach (IPAddress ip in Dns.GetHostEntry(Dns.GetHostName()).AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    list.Add(ip.ToString());
            }
        }
        catch { }
        return list;
    }
}

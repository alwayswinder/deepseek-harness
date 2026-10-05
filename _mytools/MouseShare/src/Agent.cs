// 被控端：另一台电脑。主动连到主机端（反向连接，不怕自己这边的 NAT），
// 收到事件后用 SendInput 注入到本机会话。断线自动重连。
using System;
using System.Globalization;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;

static class Agent
{
    static bool dryRun;

    public static int Run(string[] args)
    {
        string server = "127.0.0.1";
        int port = 15180;

        for (int i = 1; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "--server")
            {
                if (i + 1 >= args.Length) { Console.WriteLine("[x] --server 需要 <IP或主机名>[:端口]"); return 1; }
                string v = args[++i];
                int colon = v.LastIndexOf(':');
                if (colon > 0)
                {
                    server = v.Substring(0, colon);
                    if (!int.TryParse(v.Substring(colon + 1), NumberStyles.Integer, CultureInfo.InvariantCulture, out port))
                    { Console.WriteLine("[x] 端口不合法: " + v); return 1; }
                }
                else server = v;
            }
            else if (a == "--dry-run") dryRun = true;
            else { Console.WriteLine("[x] 未知参数: " + a); return 1; }
        }

        Console.WriteLine("MouseShare 被控端 0.1" + (dryRun ? "（dry-run：只打印不注入）" : ""));
        Console.WriteLine("目标主机: " + server + ":" + port);
        Console.WriteLine("提示: 注入不了「以管理员身份运行」的窗口和 UAC 提示框；需要时用管理员身份运行本程序。");
        Console.WriteLine();

        while (true)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    client.NoDelay = true;
                    client.Connect(server, port);
                    Console.WriteLine("[agent] 已连接 " + server + ":" + port);
                    using (NetworkStream stream = client.GetStream())
                    using (StreamReader reader = new StreamReader(stream, Encoding.ASCII))
                    {
                        string line;
                        while ((line = reader.ReadLine()) != null)
                        {
                            if (line.Length == 0) continue;
                            if (line[0] == 'P') { SendLine(stream, "P"); continue; }
                            Handle(line);
                        }
                    }
                    Console.WriteLine("[agent] 主机端关闭了连接");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[agent] " + ex.Message);
            }
            Console.WriteLine("[agent] 3 秒后重连...");
            Thread.Sleep(3000);
        }
    }

    static void SendLine(NetworkStream stream, string line)
    {
        try
        {
            byte[] b = Encoding.ASCII.GetBytes(line + "\n");
            stream.Write(b, 0, b.Length);
        }
        catch { }
    }

    // 协议（每行一条，空格分隔，十进制）：
    //   M <dwFlags> <dx> <dy> <mouseData>
    //   K <wVk> <wScan> <dwFlags>
    //   P                       心跳，回一条 P
    static void Handle(string line)
    {
        string[] p = line.Split(' ');
        try
        {
            switch (p[0])
            {
                case "M":
                    if (p.Length < 5) return;
                    InjectMouse(U(p[1]), int.Parse(p[2], CultureInfo.InvariantCulture),
                                int.Parse(p[3], CultureInfo.InvariantCulture), U(p[4]));
                    break;
                case "K":
                    if (p.Length < 4) return;
                    InjectKey((ushort)U(p[1]), (ushort)U(p[2]), U(p[3]));
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[agent] 无法处理 " + line + " : " + ex.Message);
        }
    }

    static uint U(string s) { return uint.Parse(s, NumberStyles.Integer, CultureInfo.InvariantCulture); }

    static void InjectMouse(uint flags, int dx, int dy, uint data)
    {
        if (dryRun) { Console.WriteLine("[agent] mouse flags=0x" + flags.ToString("X4") + " dx=" + dx + " dy=" + dy + " data=" + data); return; }
        Native.INPUT[] input = new Native.INPUT[1];
        input[0].type = Native.INPUT_MOUSE;
        input[0].u.mi.dx = dx;
        input[0].u.mi.dy = dy;
        input[0].u.mi.mouseData = data;
        input[0].u.mi.dwFlags = flags;
        Native.SendInput(1, input, System.Runtime.InteropServices.Marshal.SizeOf(typeof(Native.INPUT)));
    }

    static void InjectKey(ushort vk, ushort scan, uint flags)
    {
        if (dryRun) { Console.WriteLine("[agent] key vk=0x" + vk.ToString("X2") + " scan=" + scan + " flags=0x" + flags.ToString("X2")); return; }
        Native.INPUT[] input = new Native.INPUT[1];
        input[0].type = Native.INPUT_KEYBOARD;
        input[0].u.ki.wVk = vk;
        input[0].u.ki.wScan = scan;
        input[0].u.ki.dwFlags = flags;
        Native.SendInput(1, input, System.Runtime.InteropServices.Marshal.SizeOf(typeof(Native.INPUT)));
    }
}

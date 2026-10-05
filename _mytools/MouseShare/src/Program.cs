// MouseShare —— 用一套键鼠控制两台 Windows 电脑。
// 主机端（接着键鼠的那台）监听，被控端（另一台）主动连入，
// 因此两台即使隔着 NAT、不在同一网段也能工作。
using System;
using System.Runtime.InteropServices;
using System.Text;

static class Program
{
    static int Main(string[] args)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { }

        if (args.Length == 0) { Usage(); return 1; }

        switch (args[0].ToLowerInvariant())
        {
            case "host": return Host.Run(args);
            case "agent": return Agent.Run(args);
            case "selftest": return SelfTest();
            default: Usage(); return 1;
        }
    }

    static void Usage()
    {
        Console.WriteLine("MouseShare 0.1 —— 一套键鼠控制两台 Windows 电脑（反向连接，可跨 NAT）");
        Console.WriteLine();
        Console.WriteLine("  主机端（接键鼠的那台）:  MouseShare.exe host [--port 15180] [--hotkey ctrl+alt+f12] [--remote]");
        Console.WriteLine("  被控端（另一台）      :  MouseShare.exe agent --server <主机IP>:15180 [--dry-run]");
        Console.WriteLine("  自检                  :  MouseShare.exe selftest");
        Console.WriteLine();
        Console.WriteLine("  先在被控端启动 agent，再在主机端按热键切到远程；再按一次切回本地。");
    }

    // 注入链路自检：结构体布局错了 SendInput 会返回 0。
    // 鼠标只抖动 1 像素；键盘用 F24（没有任何程序会响应它）。
    static int SelfTest()
    {
        int size = Marshal.SizeOf(typeof(Native.INPUT));
        Console.WriteLine("INPUT 结构大小 = " + size + " 字节（64 位下应为 40）");

        Native.INPUT[] input = new Native.INPUT[4];
        input[0].type = Native.INPUT_MOUSE;
        input[0].u.mi.dx = 1;
        input[0].u.mi.dwFlags = Native.MOUSEEVENTF_MOVE;
        input[1].type = Native.INPUT_MOUSE;
        input[1].u.mi.dx = -1;
        input[1].u.mi.dwFlags = Native.MOUSEEVENTF_MOVE;
        input[2].type = Native.INPUT_KEYBOARD;
        input[2].u.ki.wVk = 0x87;
        input[3].type = Native.INPUT_KEYBOARD;
        input[3].u.ki.wVk = 0x87;
        input[3].u.ki.dwFlags = Native.KEYEVENTF_KEYUP;

        uint sent = Native.SendInput(4, input, size);
        Console.WriteLine("鼠标+键盘 SendInput 返回 " + sent + "/4" + (sent == 4 ? "（注入链路可用）" : "（注入失败，错误码 " + Marshal.GetLastWin32Error() + "）"));
        return sent == 4 ? 0 : 1;
    }
}

// 可选的 --status <文件>：把运行状态写成 JSON，供桌宠插件读取。
// 解析控制台里的人类可读输出又脆又麻烦，插件读这个文件即可。
using System;
using System.IO;
using System.Text;

static class Status
{
    static string path;
    static readonly object gate = new object();

    /** 设置状态文件路径；未设置时所有写入都是空操作。 */
    public static void Configure(string file)
    {
        path = string.IsNullOrEmpty(file) ? null : file;
    }

    /**
     * 覆盖写入当前状态。
     * @param role 主机端传 host，被控端传 agent。
     * @param connected 对端是否在线（被控端传自身连接是否存活）。
     * @param peer 对端地址，未知时传空串。
     * @param remote 是否处于远程模式（只有主机端有这个概念）。
     * @param rttMs 最近一次心跳往返毫秒数，未知时传 -1。
     */
    public static void Write(string role, bool connected, string peer, bool remote, int rttMs)
    {
        if (path == null) return;
        string json = "{\"role\":\"" + role + "\""
            + ",\"connected\":" + (connected ? "true" : "false")
            + ",\"peer\":\"" + (peer ?? string.Empty) + "\""
            + ",\"remote\":" + (remote ? "true" : "false")
            + ",\"rttMs\":" + rttMs
            + ",\"updatedAt\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "}";
        try
        {
            lock (gate)
            {
                string temporary = path + ".tmp";
                File.WriteAllText(temporary, json, new UTF8Encoding(false));
                if (File.Exists(path)) File.Delete(path);
                File.Move(temporary, path);
            }
        }
        catch
        {
            // 状态文件写不进去（路径不存在、被占用）不该影响键鼠转发本身。
        }
    }
}

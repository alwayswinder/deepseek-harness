// Explorer owns user-launched applications, independently of the helper's managed process Job.
using System.Reflection;
using System.Runtime.InteropServices;
using DeepSeek.Cua.Protocol;

namespace DeepSeek.Cua.Windows;

internal static class ShellBroker
{
    internal static void Launch(string path, string arguments = "", int show = 4)
    {
        var owned = new List<object>();
        T Own<T>(T value) where T : class { owned.Add(value); return value; }
        try
        {
            var shell = Own(Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!)!);
            shell.GetType().InvokeMember("ShellExecute", BindingFlags.InvokeMethod, null, shell,
                [path, arguments, Path.IsPathFullyQualified(path) ? Path.GetDirectoryName(path)! : "", "open", show]);
        }
        // Registration lookup, COM activation and the reflective call each surface their own exception type;
        // callers only need to know that Explorer did not take the request.
        catch (Exception)
        {
            throw new NativeFailure("LAUNCH_FAILED", "Windows Explorer could not confirm launch of the requested target; inspect listApps before retrying, or open the application manually");
        }
        finally
        {
            var released = new HashSet<object>(ReferenceEqualityComparer.Instance);
            foreach (var value in owned.AsEnumerable().Reverse())
                if (released.Add(value) && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
        }
    }
}

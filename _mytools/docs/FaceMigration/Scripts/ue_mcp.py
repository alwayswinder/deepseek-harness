"""极简 MCP 客户端：直接按 JSON-RPC over HTTP 调用 UE 内置 MCP（127.0.0.1:8000/mcp）。

用法：
    python ue_mcp.py toolsets
    python ue_mcp.py describe <toolset>
    python ue_mcp.py call <toolset> <tool> '<json args>'
    python ue_mcp.py call --top <tool> '<json args>'

每次运行独立建会话；不做重试包装，失败直接抛错，便于判断真实状态。
"""
import json
import sys
import urllib.request

BASE = 'http://127.0.0.1:8000/mcp'
_session = {'id': None}


def _post(payload, notify=False):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(BASE, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json, text/event-stream')
    if _session['id']:
        req.add_header('Mcp-Session-Id', _session['id'])
    with urllib.request.urlopen(req, timeout=1800) as resp:
        sid = resp.headers.get('Mcp-Session-Id')
        if sid:
            _session['id'] = sid
        body = resp.read().decode('utf-8', 'replace')
    if notify or not body.strip():
        return None
    return json.loads(body)


def _connect():
    _post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
           'params': {'protocolVersion': '2025-06-18', 'capabilities': {},
                      'clientInfo': {'name': 'dsh-ue-mcp', 'version': '1.0'}}})
    _post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, notify=True)


def rpc(method, params, req_id=2):
    _connect()
    res = _post({'jsonrpc': '2.0', 'id': req_id, 'method': method, 'params': params})
    if 'error' in res:
        raise RuntimeError(json.dumps(res['error'], ensure_ascii=False))
    return res.get('result', {})


def call_tool(toolset, tool, arguments):
    if toolset == '--top':
        params = {'tool_name': tool, 'arguments': arguments}
    else:
        params = {'toolset_name': toolset, 'tool_name': tool, 'arguments': arguments}
    return rpc('tools/call', params)


def _print(text):
    sys.stdout.reconfigure(encoding='utf-8')
    print(text)


def main(argv):
    if len(argv) < 2:
        _print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == 'toolsets':
        res = rpc('tools/call', {'tool_name': 'list_toolsets', 'arguments': {}})
        _print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0
    if cmd == 'describe':
        res = rpc('tools/call', {'tool_name': 'describe_toolset',
                                 'arguments': {'toolset_name': argv[2]}})
        _print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0
    if cmd == 'call':
        if argv[2] == '--top':
            toolset, tool, raw = '--top', argv[3], argv[4]
        else:
            toolset, tool, raw = argv[2], argv[3], argv[4]
        res = call_tool(toolset, tool, json.loads(raw))
        _print(json.dumps(res, ensure_ascii=False, indent=2))
        return 0
    _print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))

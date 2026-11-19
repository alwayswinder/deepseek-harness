
# Shared package paths: reference inputs are read-only; reports go to the target project.
from face_paths import (tool_path as _fm_tool, legacy_saved_path as _fm_saved,
    project_root as _fm_project, read_path as _fm_read, output_path as _fm_output,
    asset_path as _fm_asset, asset_disk_path as _fm_disk,
    load_asset as _fm_load_asset, save_asset as _fm_save_asset,
    node_name as _fm_node, break_link as _fm_break_link)
import sys as _fm_sys
_fm_sys.dont_write_bytecode = True
import struct, sys, glob, os

def read_string(b, o):
    n, = struct.unpack_from('<i', b, o); o += 4
    if n < 0:
        n = -n
        s = b[o:o + 2*n].decode('utf-16-le', 'replace'); o += 2*n
    else:
        s = b[o:o + n].decode('latin-1', 'replace'); o += n
    return s.rstrip('\0'), o

def read_engine_version(b, o):
    major, minor, patch, cl = struct.unpack_from('<HHHI', b, o); o += 10
    branch, o = read_string(b, o)
    return dict(major=major, minor=minor, patch=patch, changelist=cl, branch=branch), o

def parse(path):
    b = open(_fm_read(path), 'rb').read()
    o = 0
    tag, = struct.unpack_from('<I', b, o); o += 4
    legacy, = struct.unpack_from('<i', b, o); o += 4
    if legacy != -4:
        ue3, = struct.unpack_from('<i', b, o); o += 4
    ue4, = struct.unpack_from('<i', b, o); o += 4
    ue5, = struct.unpack_from('<i', b, o); o += 4
    lic, = struct.unpack_from('<i', b, o); o += 4
    r = dict(file=path, ue4=ue4, ue5=ue5, lic=lic)
    if ue5 >= 1016:
        r['saved_hash'] = b[o:o+20].hex(); o += 20
        r['header_size'], = struct.unpack_from('<i', b, o); o += 4
        saved_hash_off = o - 24
    cnt, = struct.unpack_from('<i', b, o); o += 4
    r['custom_count'] = cnt
    o += 20*cnt
    name, o = read_string(b, o)
    r['name'] = name
    flags, = struct.unpack_from('<I', b, o); o += 4
    r['flags'] = flags
    # NameCount/NameOffset
    o += 8
    o += 8                      # SoftObjectPathsCount/Offset
    loc, o = read_string(b, o)  # LocalizationId
    o += 8                      # GatherableTextData
    o += 8                      # ExportCount/Offset
    o += 8                      # ImportCount/Offset
    if ue5 >= 1015:
        o += 16                 # CellExportCount/Offset, CellImportCount/Offset
    if ue5 >= 1014:
        o += 4                  # MetaDataOffset
    o += 4                      # DependsOffset
    o += 8                      # SoftPackageReferences
    o += 4                      # SearchableNamesOffset
    o += 4                      # ThumbnailTableOffset
    if ue5 >= 1018:
        o += 8                  # ImportTypeHierarchies
    if not (flags & 0x80000000):
        o += 16                 # PersistentGuid (editor only data)
    gen, = struct.unpack_from('<i', b, o); o += 4 + 8*max(0, gen)
    sv, o = read_engine_version(b, o)
    r['saved_by'] = sv
    cv, o = read_engine_version(b, o)
    r['compatible_with'] = cv
    r['saved_hash_offset'] = saved_hash_off
    return r

def fmt(v):
    return "%d.%d.%d-%d+%s" % (v['major'], v['minor'], v['patch'], v['changelist'], v['branch'])

if __name__ == '__main__':
    for pat in sys.argv[1:]:
        for p in (glob.glob(pat, recursive=True) or [pat]):
            try:
                d = parse(p)
            except Exception as e:
                print(p, "PARSE FAIL", e); continue
            print("%-72s ue4=%s ue5=%s lic=%s flags=0x%08X" % (os.path.basename(p), d['ue4'], d['ue5'], d['lic'], d['flags']))
            print("   saved_by        : %s" % fmt(d['saved_by']))
            print("   compatible_with : %s" % fmt(d['compatible_with']))

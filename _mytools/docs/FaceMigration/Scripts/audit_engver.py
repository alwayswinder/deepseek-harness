"""Audit .uasset/.umap engine-version tags under a folder (no editor needed).

usage: python Scripts/audit_engver.py [Content/SevGame]
"""
import importlib.util
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("uever", os.path.join(HERE, "uasset_engver.py"))
uever = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uever)

TARGET = (5, 8, 3, 58210709)   # this project's engine: stock 5.8.3-58210709, licensee 0


def fmt(v):
    return uever.fmt(v)


def too_new(v, lic):
    """Approximate FLinkerLoad's verdict for this engine."""
    if lic > 0:
        return "licensee=%d > 0" % lic
    t = (v["major"], v["minor"], v["patch"])
    if t > TARGET[:3]:
        return "patch %d.%d.%d newer" % t
    cl = v["changelist"]
    if cl & 0x80000000:
        return "licensee changelist bit set"
    return None


def main(root):
    groups = Counter()
    bad = []
    unparsable = []
    total = 0
    for d, _, fs in os.walk(root):
        for f in fs:
            if not f.lower().endswith((".uasset", ".umap")):
                continue
            p = os.path.join(d, f)
            total += 1
            try:
                info = uever.parse(p)
            except Exception as e:  # noqa: BLE001
                unparsable.append((p, str(e)))
                continue
            key = (fmt(info["saved_by"]), fmt(info["compatible_with"]),
                   info["ue4"], info["ue5"], info["lic"])
            groups[key] += 1
            reasons = []
            r = too_new(info["compatible_with"], info["lic"])
            if r:
                reasons.append(r)
            if (info["ue4"], info["ue5"]) > (522, 1018):
                reasons.append("objver ue4=%d ue5=%d" % (info["ue4"], info["ue5"]))
            if reasons:
                bad.append((p, fmt(info["saved_by"]), "; ".join(reasons)))

    print("scanned %d packages under %s\n" % (total, root))
    print("== distinct version stamps ==")
    for (sb, cw, ue4, ue5, lic), n in groups.most_common():
        print("  %3d x saved_by=%s\n        compatible=%s  (ue4=%d ue5=%d lic=%d)" % (n, sb, cw, ue4, ue5, lic))
    print("\n== NOT loadable by 5.8.3-58210709: %d ==" % len(bad))
    for p, sb, why in bad:
        print("  %s\n        saved_by=%s -> %s" % (p, sb, why))
    if unparsable:
        print("\n== unparsable: %d ==" % len(unparsable))
        for p, e in unparsable:
            print("  %s :: %s" % (p, e))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join("Content", "SevGame"))

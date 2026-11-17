"""离线对比：Max 实测眼皮骨轨迹 vs UE 的线性插值 vs 绕眼球中心的圆弧插值。"""
import math

# Max 实测（Bone037，p2 = 0 → -1.75）
SAMPLES = [
    (0.0, (4.32270, -8.26317, 159.389)),
    (0.142857, (4.33495, -8.24623, 159.086)),
    (0.285714, (4.34203, -8.20864, 158.784)),
    (0.428571, (4.34387, -8.15048, 158.484)),
    (0.571429, (4.34044, -8.07197, 158.188)),
    (0.714286, (4.33174, -7.97340, 157.898)),
    (0.857143, (4.31778, -7.85516, 157.615)),
    (1.0, (4.29860, -7.71777, 157.340)),
]

P = (3.15057, -4.08607, 159.558)  # Point004 / yanqiu_L


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    return math.sqrt(dot(a, a))


def rotate(v, axis, ang):
    n = mul(axis, 1.0 / norm(axis))
    c, s = math.cos(ang), math.sin(ang)
    return add(add(mul(v, c), mul(cross(n, v), s)), mul(n, dot(n, v) * (1 - c)))


t0 = SAMPLES[0][1]
t1 = SAMPLES[-1][1]
v0 = sub(t0, P)
v1 = sub(t1, P)
axis = cross(v0, v1)
ang = math.acos(max(-1.0, min(1.0, dot(v0, v1) / (norm(v0) * norm(v1)))))

print('pivot', P)
print('v0 len %.4f  v1 len %.4f' % (norm(v0), norm(v1)))
print('orbit axis', tuple(round(x, 4) for x in mul(axis, 1.0 / norm(axis))), 'angle_deg %.3f' % math.degrees(ang))

print('\n s     max_actual                linear_err   arc_err   arc_err_vec')
max_lin = 0.0
max_arc = 0.0
for s, actual in SAMPLES:
    lin = add(t0, mul(sub(t1, t0), s))
    arc = add(P, rotate(v0, axis, ang * s))
    e_lin = norm(sub(lin, actual))
    e_arc = norm(sub(arc, actual))
    max_lin = max(max_lin, e_lin)
    max_arc = max(max_arc, e_arc)
    print('%.3f  %-24s %.5f    %.5f   %s' % (
        s, str(tuple(round(x, 3) for x in actual)), e_lin, e_arc,
        str(tuple(round(x, 4) for x in sub(arc, actual)))))

print('\nmax linear err = %.5f cm, max arc err = %.5f cm' % (max_lin, max_arc))

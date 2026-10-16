"""把新写好的校园场景整段替换掉 index.html 里原来的地球场景。

一次性机械替换：旧场景是连续的一大段（795~1076 行），逐块打补丁容易错位。
替换前后都做边界断言，防止行号漂移导致改错地方。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
INDEX = os.path.join(ROOT, "index.html")
SCENE = os.path.join(HERE, "scene.js")

START_MARK = "/* ============================== 场景"


def main():
    with open(INDEX, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    with open(SCENE, encoding="utf-8") as fh:
        scene = fh.read().rstrip("\n").split("\n")

    starts = [i for i, l in enumerate(lines) if l.startswith(START_MARK)]
    if len(starts) != 1:
        raise SystemExit("预期的场景段起点有 %d 处，不是 1 处，先人工确认" % len(starts))
    s = starts[0]

    # 场景段结束于下一个顶层注释分隔行之前
    e = None
    for i in range(s + 1, len(lines)):
        if lines[i].startswith("/* ======") and "模型加载" in lines[i]:
            e = i
            break
    if e is None:
        raise SystemExit("没找到场景段的结束位置")
    while e > s and lines[e - 1].strip() == "":
        e -= 1

    if lines[e - 1].rstrip() != "}":
        raise SystemExit("场景段最后一行不是 createScene 的收尾大括号：%r" % lines[e - 1])

    print("替换 %d~%d 行（共 %d 行）为 %d 行" % (s + 1, e, e - s, len(scene)))
    out = lines[:s] + scene + [""] + lines[e:]
    with open(INDEX, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out))


if __name__ == "__main__":
    main()

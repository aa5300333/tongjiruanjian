#!/bin/bash
cd "$(dirname "$0")"
echo "=========================================="
echo "  六合彩智能管理系统 - 一键打包工具 (Mac)"
echo "=========================================="
echo ""
if ! command -v node &> /dev/null
then
    echo "[错误] 未检测到 Node.js！"
    echo "请先去 https://nodejs.org/ 下载并安装 'LTS' 版本。"
    echo "安装完成后，请重新运行此脚本。"
    exit
fi

echo "[1/3] 正在安装基础环境..."
npm install

echo "[2/3] 正在安装打包工具..."
npm install --save-dev electron electron-builder

echo "[3/3] 正在生成电脑软件 (.app)..."
npm run dist

echo ""
echo "=========================================="
echo "  打包完成！"
echo "  请查看文件夹中的 'release' 目录。"
echo "=========================================="
read -p "按回车键退出..."

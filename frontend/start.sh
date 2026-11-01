#!/bin/bash

echo "===================================="
echo "Banana Slides (Banana Slides) Frontend Start Script"
echo "===================================="
echo ""

echo "[1/3] Check Dependency..."
if [ ! -d "node_modules" ]; then
    echo "Dependency not detected, installation under way..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Dependency installation failed; run this command manually: npm install"
        exit 1
    fi
else
    echo "Reliance Exists"
fi

echo ""
echo "[2/3] Check Environmental Variables..."
echo ""
echo "[3/3] Start development server..."
echo "The frontend will run on http://localhost:3011"
echo "Make sure the back-end service is active. http://localhost:5011"
echo ""
echo "Press Ctrl+C You can stop the server."
echo ""

npm run dev

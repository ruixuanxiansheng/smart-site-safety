$ErrorActionPreference = "Continue"
Set-Location "D:\矿大\大创网站"

git config --unset-all http.sslBackend
git config --unset-all http.sslVerify
git remote remove origin 2>$null
git remote add origin https://github.com/ruixuanxiansheng/smart-site-safety.git

git add -A
git commit -m "feat: smart site safety platform" --allow-empty
git push -u origin master

Write-Host ""
Write-Host "如果上面显示 To https://github.com/... 并且没有报错，说明推送成功。" -ForegroundColor Green
Write-Host "如果弹出 GitHub 登录窗口，用 877606699@qq.com 登录即可。" -ForegroundColor Yellow
Read-Host "按回车关闭窗口"

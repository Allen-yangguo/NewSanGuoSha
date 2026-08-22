# 三国卡牌对战 · 从 Mixkit 批量下载 9 个免费 CC0 音效
# 许可证：Mixkit Sound Effects Free License（免署名、可商用）
# 直链规律：https://assets.mixkit.co/active_storage/sfx/{ID}/{ID}-preview.mp3

$ErrorActionPreference = "Continue"
$targetDir = "d:\allen_space\new sanguosha\web-test\sfx"

# 9 个音效对应的 Mixkit ID（从 mixkit.co 搜索结果收集的真实直链）
$sfxMap = @{
    'play.mp3'       = 166    # Fast small sweep transition（出牌沙沙声）
    'attack.mp3'     = 772    # Quick zoom impact（武将攻击挥动）
    'hit.mp3'         = 2299   # Short bass hit（伤害命中低频）
    'armor.mp3'      = 2639   # Quick metal transition sweep（防具金属撞击）
    'qi.mp3'          = 2633   # Sweeping sparkle presentation（补气上升铃声）
    'heal.mp3'        = 2608   # Air zoom vacuum（补血温暖上升）
    'strategy.mp3'   = 1457   # Glitch static（兵法书页/电流）
    'formation.mp3'  = 3115   # Fast transitions swoosh（阵法神秘）
    'ultimate.mp3'   = 2908   # Movie trailer epic impact（绝杀剑鸣大冲击）
}

Write-Host "=== 开始下载 9 个音效到 $targetDir ===" -ForegroundColor Cyan
Write-Host ""

$okCount = 0
$failCount = 0

foreach ($pair in $sfxMap.GetEnumerator()) {
    $filename = $pair.Key
    $id = $pair.Value
    $url = "https://assets.mixkit.co/active_storage/sfx/$id/$id-preview.mp3"
    $targetPath = Join-Path $targetDir $filename

    Write-Host "[$($sfxMap.Keys.IndexOf($filename) + 1)/9] 下载 $filename ..." -NoNewline
    Write-Host "  (ID: $id)" -ForegroundColor DarkGray

    try {
        # 用 Invoke-WebRequest 下载二进制
        $ProgressPreference = 'SilentlyContinue'  # 禁用进度条加快下载
        Invoke-WebRequest -Uri $url -OutFile $targetPath -UseBasicParsing -TimeoutSec 30

        $size = (Get-Item $targetPath).Length
        if ($size -lt 500) {
            Write-Host "  ✗ 文件过小（$size 字节），可能非有效 MP3" -ForegroundColor Red
            Remove-Item $targetPath -Force
            $failCount++
        } else {
            $sizeKB = [math]::Round($size / 1024, 1)
            Write-Host "  ✓ 成功 · $sizeKB KB" -ForegroundColor Green
            $okCount++
        }
    } catch {
        Write-Host "  ✗ 失败：$($_.Exception.Message)" -ForegroundColor Red
        if (Test-Path $targetPath) { Remove-Item $targetPath -Force }
        $failCount++
    }
}

Write-Host ""
Write-Host "=== 下载完成 ===" -ForegroundColor Cyan
Write-Host "成功：$okCount 个  失败：$failCount 个" -ForegroundColor $(if ($failCount -eq 0) { 'Green' } else { 'Yellow' })
Write-Host ""

if ($failCount -gt 0) {
    Write-Host "⚠ 失败的音效将使用 Web Audio API 程序化合成兜底，不影响游戏运行" -ForegroundColor Yellow
    Write-Host "  您可以稍后手动从 https://mixkit.co/free-sound-effects/ 下载并放入 $targetDir"
}

Write-Host ""
Write-Host "音效清单："
Get-ChildItem $targetDir -Filter "*.mp3" | ForEach-Object {
    $sizeKB = [math]::Round($_.Length / 1024, 1)
    Write-Host "  $($_.Name)  -  $sizeKB KB"
}

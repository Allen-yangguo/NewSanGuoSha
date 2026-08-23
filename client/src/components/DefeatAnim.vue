<!--
  失败过场动画：武将受伤跪地
  - 暗色场景，武将剪影跪地、单手撑地
  - 鲜血滴落、尘土飘散
  - 文字「敗」从下浮现
-->
<template>
  <div class="defeat-stage">
    <svg class="warrior-svg" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg">
      <!-- 地面阴影 -->
      <ellipse class="shadow" cx="120" cy="280" rx="80" ry="10" fill="#000" opacity="0.4" />
      <!-- 武将剪影：跪地单手撑地 -->
      <g class="warrior">
        <!-- 后腿（跪着，小腿贴地） -->
        <path d="M 110 270 Q 90 265 80 280 L 150 280 Q 145 270 135 265 Z" fill="#2A2117" />
        <!-- 前腿（屈膝） -->
        <path d="M 140 270 Q 145 230 150 220 L 170 220 Q 175 250 170 280 Z" fill="#342A20" />
        <!-- 身躯（前倾） -->
        <path d="M 105 200 Q 100 240 110 270 L 160 270 Q 170 240 165 200 Q 140 185 105 200 Z" fill="#2A2117" />
        <!-- 头部低垂 -->
        <circle cx="115" cy="185" r="14" fill="#3A2E22" />
        <!-- 头盔翎羽（垂落） -->
        <path d="M 118 172 Q 130 160 135 175 Q 128 180 118 180 Z" fill="#6B2420" opacity="0.7" />
        <!-- 手臂前伸撑地 -->
        <path d="M 160 210 Q 185 215 195 245 Q 198 260 190 268 L 175 265 Q 175 245 168 235 Z" fill="#2A2117" />
        <!-- 手部（撑地） -->
        <ellipse cx="192" cy="270" rx="8" ry="4" fill="#4A3D2E" />
        <!-- 另一只手垂落 -->
        <path d="M 105 220 Q 95 240 100 260 L 110 262 Q 110 240 115 225 Z" fill="#342A20" />
        <!-- 断剑落在一旁 -->
        <g class="broken-sword">
          <path d="M 60 275 L 90 268 L 92 272 L 62 279 Z" fill="#8E734F" />
          <path d="M 88 267 L 95 265 L 94 270 L 90 270 Z" fill="#C9A227" />
        </g>
      </g>
      <!-- 鲜血滴 -->
      <g class="blood">
        <circle class="drop d1" cx="125" cy="200" r="2.5" fill="#8C1A1A" />
        <circle class="drop d2" cx="115" cy="200" r="2" fill="#A02020" />
        <circle class="drop d3" cx="130" cy="205" r="1.5" fill="#8C1A1A" />
      </g>
      <!-- 尘土 -->
      <g class="dust">
        <circle class="dust-particle p1" cx="60" cy="270" r="3" fill="#7C6344" opacity="0.5" />
        <circle class="dust-particle p2" cx="180" cy="265" r="2.5" fill="#7C6344" opacity="0.4" />
        <circle class="dust-particle p3" cx="200" cy="275" r="2" fill="#5C4A32" opacity="0.6" />
      </g>
    </svg>
    <div class="defeat-title">敗 北</div>
    <div class="defeat-sub">武將殞落</div>
  </div>
</template>

<script setup lang="ts">
// 纯展示组件
</script>

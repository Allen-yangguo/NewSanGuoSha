<!--
  胜利过场动画：旗帜飘扬
  - 米黄底色 + 朱砂旗面 + 金穗
  - 旗面用 SVG path + CSS transform 做飘扬效果
  - 旗杆固定，文字「胜」从下浮起
-->
<template>
  <div class="victory-stage">
    <svg class="flag-svg" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg">
      <!-- 旗杆 -->
      <rect x="40" y="20" width="6" height="280" fill="#5C4A32" />
      <circle cx="43" cy="18" r="7" fill="#C9A227" />
      <!-- 旗面：通过 path + 多层动画实现飘扬感 -->
      <g class="flag-group">
        <path class="flag-wave-1"
          d="M 46 40 Q 120 30 200 50 L 200 150 Q 120 130 46 150 Z"
          fill="#B5463A" stroke="#8C3329" stroke-width="1.5" />
        <path class="flag-wave-2"
          d="M 46 40 Q 120 30 200 50 L 200 150 Q 120 130 46 150 Z"
          fill="url(#flagShade)" opacity="0.5" />
        <!-- 中央「魏」字（用文字代替具体国号，通用）-->
        <text x="120" y="105" class="flag-text" text-anchor="middle">勝</text>
        <!-- 旗穗 -->
        <path d="M 200 50 Q 215 80 200 110" stroke="#E8C66E" stroke-width="2" fill="none" />
      </g>
      <defs>
        <linearGradient id="flagShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#000" stop-opacity="0" />
          <stop offset="0.5" stop-color="#000" stop-opacity="0.3" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.2" />
        </linearGradient>
      </defs>
      <!-- 光斑 -->
      <circle class="spark s1" cx="120" cy="80" r="3" fill="#FFD700" />
      <circle class="spark s2" cx="80" cy="120" r="2" fill="#FFE4B5" />
      <circle class="spark s3" cx="170" cy="100" r="2.5" fill="#FFD700" />
    </svg>
    <div class="victory-title">勝 利</div>
  </div>
</template>

<script setup lang="ts">
// 纯展示组件，无逻辑
</script>

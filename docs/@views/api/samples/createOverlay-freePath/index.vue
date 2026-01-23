<script setup>
import ChartPreview from '../../../../@components/ChartPreview.vue';
import { data } from './index.data'
</script>

<template>
  <ChartPreview
    title="createOverlay-freePath"
    chartId="createOverlay-freePath-chart"
    :code="data.js"/>
</template>

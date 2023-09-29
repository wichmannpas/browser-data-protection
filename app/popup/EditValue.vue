<script setup lang="ts">
import { ref } from 'vue'

let foo: number = 12
const plaintextValue = ref('')

</script>

<template>
  <div>
    edit

    <input type="text" v-model="plaintextValue">
    {{ plaintextValue }}
  </div>
</template>
<script setup lang="ts">
import { defineProps, ref } from 'vue'
import InternalProtectedField from '../scripts/InternalProtectedField'

const props = defineProps({
  field: InternalProtectedField
})

const plaintextValue = ref('')

</script>

<template>
  <div>
    edit

    {{ props.field }}

    <input type="text" v-model="plaintextValue">
    {{ plaintextValue }}
  </div>
</template>
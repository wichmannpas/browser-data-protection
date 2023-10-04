<script setup lang="ts">
import { defineProps, ref } from 'vue'
import InternalProtectedField from '../scripts/InternalProtectedField'

const props = defineProps({
  field: InternalProtectedField
})

const plaintextValue = ref('')

async function finishEditing() {
  // TODO: handle value

  await chrome.runtime.sendMessage({
    context: 'bdp',
    operation: 'stopEdit'
  })
  window.close()
}

</script>

<template>
  <div>
    <form @submit.prevent="finishEditing">
      {{ props.field }}

      <input type="text" v-model="plaintextValue">

      <button type="submit" class="btn btn-block btn-success">
        Finish editing
      </button>

      {{ plaintextValue }}
    </form>
  </div>
</template>
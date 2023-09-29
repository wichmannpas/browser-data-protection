<script setup lang="ts">
import { computed, reactive, ref, Ref, onBeforeMount } from 'vue'
import EditValue from '../../dist/chrome/popup/EditValue.vue';

const tabState = reactive({
  activeFieldId: null as null | number,
  fields: [] as InternalProtectedField[]
})
const ready = ref(false)

const activeField = computed(() => {
  if (tabState.activeFieldId === null) {
    return null
  }

  return tabState.fields.find(field.fieldId === tabState.activeFieldId)
})

onBeforeMount(() => {
  chrome.runtime.sendMessage({ context: 'bdp', operation: 'getTabState' }, response => {
    console.log('response', response)
    Object.assign(tabState, response)
    ready.value = true
  })
})
</script>

<template>
  <div>
    <h4>BrowserDataProtection</h4>

    <div v-if="ready">
      <template v-if="tabState.activeFieldId !== null">
        <EditValue :field="activeField" />
      </template>
      <div v-else-if="tabState.fields.length > 0">
        <p>
          No field is currently selected.
        </p>
      </div>
      <div v-else>
        <p>
          This web application has no secure fields.
        </p>
      </div>
    </div>
    <div v-else class="loading loading-lg"></div>
  </div>
</template>
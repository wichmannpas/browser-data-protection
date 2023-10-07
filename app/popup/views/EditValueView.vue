<script setup lang="ts">
import { computed, onBeforeMount, reactive, ref } from 'vue'
import EditValue from '../components/EditValue.vue';
import InternalProtectedField from '../../scripts/InternalProtectedField'

const tabState = reactive({
  activeFieldId: null as null | number,
  fields: [] as InternalProtectedField[]
})
const ready = ref(false)

const activeField = computed(() => {
  if (tabState.activeFieldId === null) {
    return null
  }

  return tabState.fields.find(field => field.fieldId === tabState.activeFieldId)
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
  <div v-if="ready">
    <h5>Edit Field Value</h5>
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
</template>
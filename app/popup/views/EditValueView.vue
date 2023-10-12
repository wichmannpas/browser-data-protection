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

  const field = tabState.fields.find(field => field.fieldId === tabState.activeFieldId)
  if (field === undefined) {
    throw new Error(`field with id ${tabState.activeFieldId} not found`)
  }
  return field as InternalProtectedField
})

onBeforeMount(() => {
  chrome.runtime.sendMessage({ context: 'bdp', operation: 'getTabState' }, response => {
    response.fields = response.fields.map((field: InternalProtectedField) => {
      // Chrome uses JSON serialization, which makes a native object of the InternalProtectedField.
      const newField = new InternalProtectedField(field.fieldId, field.origin, field.element, field.options, field.ciphertextValue)
      Object.assign(newField, field)
      return newField
    })
    Object.assign(tabState, response)
    ready.value = true
  })
})

</script>

<template>
  <div v-if="ready">
    <h5>Edit Field Value</h5>
    <EditValue v-if="activeField" :field="activeField" />
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
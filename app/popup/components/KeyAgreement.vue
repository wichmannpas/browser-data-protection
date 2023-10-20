<script setup lang="ts">
import InternalProtectedField from '../../scripts/InternalProtectedField';

const props = defineProps({
  field: {
    type: InternalProtectedField,
    required: true
  }
})
</script>

<template>
  <div>
    <p>
      This field uses a key agreement protocol to establish an encryption key between you and the other party.
      For the key agreement, both parties need to generate a key pair and supply it to the web application.
    </p>

    <p>
      You can generate a key pair to use for this key agreement.

      <button class="btn btn-block">Generate key pair</button>
    </p>

    <!-- TODO: add condition -->
    <p>
      The web application did not provide a public key of the other party.
    </p>
  </div>
</template>
<script setup lang="ts">
defineProps({
  passwordStrength: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <div class="bar bar-sm" :style="'background: ' + (passwordStrength.score < 1 ? 'red' : 'white') + ';'">
    <div class="bar-item" role="progressbar"
      :style="'width: ' + passwordStrength.score * 25 + '%; background: ' + (passwordStrength.score > 3 ? 'green' : passwordStrength.score > 1 ? 'orange' : 'red') + ';'"
      :aria-valuenow="passwordStrength.score" aria-valuemin="0" aria-valuemax="4"></div>
  </div>
  Password strength: {{ passwordStrength.score }}/4
  <div v-if="passwordStrength.feedback.warning" class="toast toast-warning">
    {{ passwordStrength.feedback.warning }}
  </div>
  <div v-for="suggestion in passwordStrength.feedback.suggestions">
    {{ suggestion }}
  </div>
  <div>
    Expected time to crack:
    {{ passwordStrength.crack_times_display.offline_slow_hashing_1e4_per_second }}
  </div>
</template>
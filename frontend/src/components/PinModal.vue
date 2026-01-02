<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { usePinProtection } from '../composables/usePinProtection'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'unlocked'): void
}>()

const { unlock } = usePinProtection()

const pin = ref('')
const error = ref('')
const loading = ref(false)

// モーダルが表示されたときにPIN入力をクリア
watch(() => props.visible, (visible) => {
  if (visible) {
    pin.value = ''
    error.value = ''
  }
})

async function handleSubmit() {
  if (!pin.value) {
    error.value = 'PINを入力してください'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const success = await unlock(pin.value)
    if (success) {
      emit('unlocked')
      emit('update:visible', false)
    } else {
      error.value = 'PINが正しくありません'
      pin.value = ''
    }
  } catch (err) {
    error.value = 'エラーが発生しました'
  } finally {
    loading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleSubmit()
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="false"
    :draggable="false"
    header="PIN入力"
    :style="{ width: '400px' }"
    class="pin-modal"
  >
    <div class="pin-modal-content">
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        アプリのロックを解除するためにPINを入力してください
      </p>

      <div class="flex flex-col gap-2">
        <InputText
          v-model="pin"
          type="password"
          inputmode="numeric"
          placeholder="PINコード"
          :class="{ 'p-invalid': error }"
          :disabled="loading"
          autofocus
          @keydown="handleKeydown"
        />

        <small v-if="error" class="text-red-500">{{ error }}</small>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <Button
          label="確認"
          :loading="loading"
          @click="handleSubmit"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.pin-modal-content {
  padding: 1rem 0;
}
</style>

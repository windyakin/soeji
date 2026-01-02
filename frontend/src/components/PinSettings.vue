<script setup lang="ts">
import { ref } from 'vue'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { usePinProtection } from '../composables/usePinProtection'

const { isPinEnabled, hasPinSet, setPin, changePin, disablePin } = usePinProtection()

const currentPin = ref('')
const newPin = ref('')
const confirmPin = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

async function handleSetPin() {
  error.value = ''
  success.value = ''

  if (!newPin.value || newPin.value.length < 4) {
    error.value = 'PINは4桁以上で設定してください'
    return
  }

  if (newPin.value !== confirmPin.value) {
    error.value = 'PINが一致しません'
    return
  }

  loading.value = true

  try {
    await setPin(newPin.value)
    success.value = 'PINを設定しました'
    newPin.value = ''
    confirmPin.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'エラーが発生しました'
  } finally {
    loading.value = false
  }
}

async function handleChangePin() {
  error.value = ''
  success.value = ''

  if (!currentPin.value) {
    error.value = '現在のPINを入力してください'
    return
  }

  if (!newPin.value || newPin.value.length < 4) {
    error.value = '新しいPINは4桁以上で設定してください'
    return
  }

  if (newPin.value !== confirmPin.value) {
    error.value = '新しいPINが一致しません'
    return
  }

  loading.value = true

  try {
    await changePin(currentPin.value, newPin.value)
    success.value = 'PINを変更しました'
    currentPin.value = ''
    newPin.value = ''
    confirmPin.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'エラーが発生しました'
  } finally {
    loading.value = false
  }
}

function handleDisablePin() {
  error.value = ''
  success.value = ''

  disablePin()
  success.value = 'PIN保護を無効にしました'
  currentPin.value = ''
  newPin.value = ''
  confirmPin.value = ''
}
</script>

<template>
  <Card>
    <template #title>
      <div class="flex items-center gap-2">
        <i class="pi pi-lock text-2xl"></i>
        <span>PIN保護設定</span>
      </div>
    </template>
    <template #content>
      <div class="flex flex-col gap-4">
        <p class="text-gray-700 dark:text-gray-300">
          アプリを開く際にPINコードでの認証を要求します。PINはこのデバイスにのみ保存されます。
        </p>

        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        <Message v-if="success" severity="success" :closable="false">{{ success }}</Message>

        <div v-if="isPinEnabled && hasPinSet" class="flex flex-col gap-4">
          <div class="text-sm">
            <i class="pi pi-check-circle text-green-500"></i>
            <span class="ml-2">PIN保護が有効です</span>
          </div>

          <div class="border-t pt-4 dark:border-gray-700">
            <h3 class="font-semibold mb-3">PINを変更</h3>

            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium">現在のPIN</label>
                <InputText
                  v-model="currentPin"
                  type="password"
                  inputmode="numeric"
                  placeholder="現在のPIN"
                  :disabled="loading"
                />
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium">新しいPIN</label>
                <InputText
                  v-model="newPin"
                  type="password"
                  inputmode="numeric"
                  placeholder="新しいPIN（4桁以上）"
                  :disabled="loading"
                />
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium">新しいPIN（確認）</label>
                <InputText
                  v-model="confirmPin"
                  type="password"
                  inputmode="numeric"
                  placeholder="新しいPINを再入力"
                  :disabled="loading"
                />
              </div>

              <div class="flex gap-2">
                <Button
                  label="変更"
                  :loading="loading"
                  @click="handleChangePin"
                />
                <Button
                  label="PIN保護を無効化"
                  severity="secondary"
                  outlined
                  :disabled="loading"
                  @click="handleDisablePin"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex flex-col gap-4">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            <i class="pi pi-info-circle"></i>
            <span class="ml-2">PIN保護が設定されていません</span>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium">PIN</label>
              <InputText
                v-model="newPin"
                type="password"
                inputmode="numeric"
                placeholder="PIN（4桁以上）"
                :disabled="loading"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium">PIN（確認）</label>
              <InputText
                v-model="confirmPin"
                type="password"
                inputmode="numeric"
                placeholder="PINを再入力"
                :disabled="loading"
              />
            </div>

            <Button
              label="PINを設定"
              :loading="loading"
              @click="handleSetPin"
            />
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

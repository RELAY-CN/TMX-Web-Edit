import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

// 生产环境启用轻量防逆向（开发模式不影响调试）
if (import.meta.env.PROD) {
  void import('./security/antiReverse').then((m) => m.enableAntiReverse())
}

const app = createApp(App)
app.use(createPinia())
app.mount('#app')

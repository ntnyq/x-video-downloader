import { defineAppConfig } from '#imports'

declare module '#imports' {
  export interface WxtAppConfig {
    readonly theme?: 'light' | 'dark'
    readonly appTitle: string
  }
}

export default defineAppConfig({
  appTitle: import.meta.env.VITE_APP_TITLE,
  theme: 'light',
})

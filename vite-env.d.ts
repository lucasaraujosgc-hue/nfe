// Manually define ImportMeta types since vite/client is missing or causing errors
interface ImportMetaEnv {
  readonly VITE_USER?: string;
  readonly VITE_PASSWORD?: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  // Declarados explicitamente (não só via merge com vite/client) porque o build
  // do Railway falha intermitentemente em enxergar os tipos do vite/client
  // ("Property 'DEV' does not exist"); com isso o typecheck não depende disso.
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

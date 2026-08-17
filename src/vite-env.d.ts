/// <reference types="vite/client" />
/// <reference types="vite-plugin-pages/client-react" />

interface ImportMetaEnv {
  /** Origin of the CORS proxy for latitude.sh S3 (see worker/). */
  readonly VITE_S3_PROXY?: string;
}

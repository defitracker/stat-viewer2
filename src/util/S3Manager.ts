import {
  S3Client,
  ListObjectsCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type _Object,
  type ListObjectsCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type CS3Manager = {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * latitude.sh object storage. Deliberately NOT user-editable: this is the host
 * SigV4 signs for, and typing the proxy's URL here instead silently produces
 * SignatureDoesNotMatch — the proxy presents this host upstream, so a signature
 * made for any other host cannot match.
 */
export const S3_ENDPOINT = "https://objects.nyc.storage.sh";

/** Origin that relays to S3_ENDPOINT while adding CORS headers: the vite proxy
 *  in dev, the Cloudflare worker (see worker/) in prod. Empty = talk direct. */
const PROXY =
  import.meta.env.VITE_S3_PROXY ?? (import.meta.env.DEV ? location.origin : "");

/**
 * Send S3 traffic to PROXY while still *signing* for `endpoint`.
 *
 * SigV4 covers the host header and the URI path, so the proxy has to receive
 * and forward both verbatim — only the TCP destination may differ. Patching
 * fetch is what makes that one change: it catches the SDK's own requests and
 * the presigned-URL fetches in S3FileSelect alike, without reaching into
 * @aws-sdk middleware internals that shift between releases.
 *
 * ponytail: global patch, scoped to one host. Swap for a custom SDK
 * requestHandler + a presign rewrite if anything else ever needs its own.
 */
let proxyInstalled = false;
function routeThroughProxy(endpoint: string) {
  if (proxyInstalled || !PROXY || !endpoint) return;
  proxyInstalled = true;

  const signedHost = new URL(endpoint).host;
  const proxy = new URL(PROXY);
  const original = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    let url: URL;
    try {
      url = new URL(raw, location.href);
    } catch {
      return original(input, init);
    }
    if (url.host !== signedHost) return original(input, init);

    url.protocol = proxy.protocol;
    url.host = proxy.host;
    return input instanceof Request
      ? original(new Request(url.href, input), init)
      : original(url.href, init);
  };
}

class CS3Connect {
  private manager: S3Manager | null = null;

  public async connect(data: CS3Manager): Promise<S3Manager | Error> {
    routeThroughProxy(S3_ENDPOINT);

    const s3 = new S3Client({
      region: data.region,
      credentials: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
    });

    try {
      await s3.send(new ListObjectsCommand({ Bucket: data.bucketName }));
      const manager = new S3Manager(s3, data.bucketName);
      this.manager = manager;
      return manager;
    } catch (e) {
      return e as Error;
    }
  }

  public getManager() {
    return this.manager;
  }
}

export const S3Connect = new CS3Connect();

export type { _Object as S3Object };

export class S3Manager {
  private s3: S3Client;
  private bucketName: string;

  constructor(s3: S3Client, bucketName: string) {
    this.s3 = s3;
    this.bucketName = bucketName;
  }

  public async getObject(key: string) {
    try {
      const data = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: key })
      );
      return data.Body
        ? {
            body: await data.Body.transformToByteArray(),
            contentType: data.ContentType,
            filename: key.split("/").pop() || "unknown_name",
          }
        : undefined;
    } catch (e) {
      console.error("[S3Manager] error getObject", e);
      return undefined;
    }
  }

  /** Short-lived signed GET url — lets the browser fetch() the object as a stream
   *  (progress + incremental save) instead of buffering it in the aws-sdk. */
  public async getSignedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      { expiresIn: 600 }
    );
  }

  public async deleteObject(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucketName, Key: key })
    );
  }

  public async listObjects() {
    let iter = 0;
    let marker: string | undefined = undefined;
    const allData: _Object[] = [];

    while (iter === 0 || marker !== undefined) {
      const data: ListObjectsCommandOutput = await this.s3.send(
        new ListObjectsCommand({
          Bucket: this.bucketName,
          // Prefix: "wo_",
          Marker: marker,
        })
      );
      console.log("data", iter, data.Contents?.length);

      // Unfiltered on purpose: prefix selection lives in s3PrefixStore so the picker
      // can show a live count per prefix, including keys nothing matches.
      allData.push(...(data.Contents ?? []));

      iter += 1;

      if (data.IsTruncated && data.Contents && data.Contents.length > 0) {
        marker = data.Contents[data.Contents.length - 1].Key;
      } else {
        marker = undefined;
      }
    }

    return allData;
  }
}

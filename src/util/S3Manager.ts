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

class CS3Connect {
  private manager: S3Manager | null = null;

  public async connect(data: CS3Manager): Promise<S3Manager | Error> {
    const s3 = new S3Client({
      region: data.region,
      credentials: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
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

      const filteredData =
        data.Contents?.filter((d) => {
          const check_aa = localStorage.getItem("aa") === "1";
          return (
            (check_aa && d.Key?.startsWith("aa_")) ||
            d.Key?.startsWith("wo_") ||
            d.Key?.startsWith("worker") ||
            d.Key?.startsWith("evinfo_")
          );
        }) ?? [];
      allData.push(...filteredData);

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

import S3, { DeleteObjectRequest, GetObjectRequest, ListObjectsRequest } from "aws-sdk/clients/s3";

type CS3Manager = {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

class CS3Connect {
  private manager: S3Manager | null = null;

  public async connect(data: CS3Manager): Promise<S3Manager | Error> {
    const s3 = new S3({
      region: data.region,
      credentials: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
    });

    const listParams: ListObjectsRequest = {
      Bucket: data.bucketName,
    };

    try {
      await s3.listObjects(listParams).promise();
      const manager = new S3Manager(s3, data.bucketName);
      this.manager = manager;
      return manager;
    } catch (e: any) {
      return e;
    }
  }

  public getManager() {
    return this.manager;
  }
}

export const S3Connect = new CS3Connect();

export class S3Manager {
  private s3: S3;
  private bucketName: string;

  constructor(s3: S3, bucketName: string) {
    this.s3 = s3;
    this.bucketName = bucketName;
  }

  public async getObject(key: string) {
    const getParams: GetObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const data = await this.s3.getObject(getParams).promise();
      return data.Body
        ? {
            body: data.Body,
            contentType: data.ContentType,
            filename: key.split("/").pop() || "unknown_name",
          }
        : undefined;
    } catch (e: any) {
      console.error("[S3Manager] error getObject", e);
      return undefined;
    }
  }

  public async deleteObject(key: string) {
    const deleteParams: DeleteObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    await this.s3.deleteObject(deleteParams).promise();
  }

  public async listObjects() {
    const listParams: ListObjectsRequest = {
      Bucket: this.bucketName,
      Prefix: "wo_",
    };

    const data = await this.s3.listObjects(listParams).promise();
    return data.Contents || [];
  }
}

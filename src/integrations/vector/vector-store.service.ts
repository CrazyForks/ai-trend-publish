import { vectorItems } from "@src/db/schema.ts";
import { and, eq, inArray } from "drizzle-orm";
import { VectorSimilarityUtil } from "@src/utils/VectorSimilarityUtil.ts";
import type { TrendPublishDatabase } from "@src/db/db.ts";
import type {
  NewVectorRecord,
  SimilaritySearchResult,
  VectorRecord,
  VectorStore,
} from "@src/core/ports/vector-store.ts";

export class VectorService implements VectorStore {
  constructor(private readonly db: TrendPublishDatabase) {}

  /**
   * 创建新的向量记录
   */
  async create(data: NewVectorRecord): Promise<VectorRecord> {
    const id = Date.now();
    await this.db.insert(vectorItems).values({
      id,
      ...data,
    });

    const [result] = await this.db
      .select()
      .from(vectorItems)
      .where(eq(vectorItems.id, id));

    return result as VectorRecord;
  }

  /**
   * 批量创建向量记录
   */
  async createBatch(items: NewVectorRecord[]): Promise<VectorRecord[]> {
    const timestamp = Date.now();
    const vectorsWithIds = items.map((item, index) => ({
      id: timestamp + index,
      ...item,
    }));

    await this.db.insert(vectorItems).values(vectorsWithIds);

    const results = await this.db
      .select()
      .from(vectorItems)
      .where(inArray(vectorItems.id, vectorsWithIds.map((v) => v.id)));

    return results as VectorRecord[];
  }

  /**
   * 根据ID获取向量记录
   */
  async getById(id: number): Promise<VectorRecord | null> {
    const [result] = await this.db
      .select()
      .from(vectorItems)
      .where(eq(vectorItems.id, id));

    return result ? (result as VectorRecord) : null;
  }

  /**
   * 根据类型获取向量记录列表
   */
  async getByType(vectorType: string): Promise<VectorRecord[]> {
    const results = await this.db
      .select()
      .from(vectorItems)
      .where(eq(vectorItems.vectorType, vectorType));

    return results as VectorRecord[];
  }

  /**
   * 更新向量记录
   */
  async update(
    id: number,
    data: Partial<NewVectorRecord>,
  ): Promise<boolean> {
    await this.db
      .update(vectorItems)
      .set(data)
      .where(eq(vectorItems.id, id));

    const [result] = await this.db
      .select()
      .from(vectorItems)
      .where(eq(vectorItems.id, id));

    return !!result;
  }

  /**
   * 删除向量记录
   */
  async delete(id: number): Promise<boolean> {
    const [beforeDelete] = await this.db
      .select()
      .from(vectorItems)
      .where(eq(vectorItems.id, id));

    if (!beforeDelete) return false;

    await this.db
      .delete(vectorItems)
      .where(eq(vectorItems.id, id));

    return true;
  }

  /**
   * 批量删除向量记录
   */
  async deleteBatch(ids: number[]): Promise<boolean> {
    const beforeDelete = await this.db
      .select()
      .from(vectorItems)
      .where(inArray(vectorItems.id, ids));

    if (beforeDelete.length === 0) return false;

    await this.db
      .delete(vectorItems)
      .where(inArray(vectorItems.id, ids));

    return true;
  }

  /**
   * 查找相似向量
   * @param vector 目标向量
   * @param options 查询选项
   */
  async findSimilar(
    vector: number[],
    options: {
      threshold?: number;
      limit?: number;
      vectorType?: string;
      similarityMethod?: "cosine" | "euclidean";
    } = {},
  ): Promise<SimilaritySearchResult[]> {
    const {
      threshold = 0.8,
      limit = 10,
      vectorType,
      similarityMethod = "cosine",
    } = options;

    // 构建查询条件
    const conditions = [];
    if (vectorType) {
      conditions.push(eq(vectorItems.vectorType, vectorType));
    }

    // 获取向量
    const items = await this.db
      .select()
      .from(vectorItems)
      .where(and(...conditions));

    // 计算相似度
    const similarItems = (items as VectorRecord[])
      .map((item) => {
        const itemVector = item.vector;
        const similarity = similarityMethod === "cosine"
          ? VectorSimilarityUtil.cosineSimilarity(vector, itemVector)
          : VectorSimilarityUtil.distanceToSimilarity(
            VectorSimilarityUtil.euclideanDistance(vector, itemVector),
          );

        return {
          ...item,
          similarity,
        };
      })
      .filter((item) => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return similarItems;
  }

  /**
   * 获取向量统计信息
   */
  async getStats(_vectorType?: string): Promise<{
    total: number;
    byType: Record<string, number>;
  }> {
    const items = await this.db.select().from(vectorItems);

    const stats = {
      total: items.length,
      byType: (items as VectorRecord[]).reduce(
        (acc: Record<string, number>, item) => {
          const type = item.vectorType || "unknown";
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    return stats;
  }
}

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { Node, prisma } from '@penx/db'
import { INode, NodeType } from '@penx/model-types'

export const syncNodesInput = z.object({
  version: z.number(),
  spaceId: z.string(),
  added: z.string(),
  updated: z.string(),
  deleted: z.string(),
})

export type SyncUserInput = z.infer<typeof syncNodesInput>

export function syncNodes(input: SyncUserInput) {
  const added: INode[] = JSON.parse(input.added)
  const updated: INode[] = JSON.parse(input.updated)
  const deleted: string[] = JSON.parse(input.deleted)

  // console.log(
  //   '===========added:',
  //   added,
  //   'updated:',
  //   updated,
  //   'deleted:',
  //   deleted,
  // )

  return prisma.$transaction(
    async (tx) => {
      const space = await tx.space.findUniqueOrThrow({
        where: { id: input.spaceId },
      })

      const version = (space?.nodeSnapshot as any)?.version || 0

      console.log('input.version:', input.version, 'space.version:', version)

      if (input.version < version) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Version invalid, input version: ${input.version}, remote version: ${version}`,
        })
      }

      if (added.length) {
        await tx.node.createMany({
          data: added.map((item) => {
            const { openedAt, createdAt, updatedAt, ...rest } = item
            return {
              ...rest,
              openedAt: new Date(openedAt),
            }
          }),
        })
      }

      for (const item of updated) {
        const { openedAt, createdAt, updatedAt, ...rest } = item

        await tx.node.update({
          where: { id: item.id },
          data: {
            ...rest,
            openedAt: new Date(openedAt),
          },
        })

        // try {
        // } catch (error) {
        //   console.log('sycn update error', error)
        // }
      }

      // await tx.node.deleteMany({
      //   where: {
      //     id: {
      //       in: deleted,
      //     },
      //   },
      // })

      const newVersion = version + 1

      // TODO: should clean no used nodes

      const nodes = await tx.node.findMany({
        where: { spaceId: input.spaceId },
      })

      await tx.space.update({
        where: { id: input.spaceId },
        data: {
          nodeSnapshot: {
            version: newVersion,
            nodeMap: {}, // TODO: how to handle encrypted?
          },
        },
      })

      await cleanDeletedNodes(nodes, async (id) => {
        tx.node.delete({
          where: { id },
        })
      })

      return newVersion
    },
    {
      maxWait: 1000 * 60, // default: 2000
      timeout: 1000 * 60, // default: 5000
    },
  )
}

async function cleanDeletedNodes(
  nodes: Node[],
  deleteNode: (id: string) => Promise<void>,
) {
  const nodeMap = new Map<string, Node>()

  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  for (const node of nodes) {
    // TODO: need improvement
    if (
      [
        NodeType.DATABASE,
        NodeType.COLUMN,
        NodeType.ROW,
        NodeType.VIEW,
        NodeType.CELL,
        NodeType.ROOT,
        NodeType.DAILY_ROOT,
        NodeType.DATABASE_ROOT,
      ].includes(node.type as NodeType)
    ) {
      continue
    }

    // if (!Reflect.has(node, 'parentId')) continue
    if (!node.parentId) continue

    const parentNode = nodeMap.get(node.parentId)
    const children = (parentNode?.children || []) as string

    if (!children.includes(node.id)) {
      console.log('=======clear node!!!!', node)
      await deleteNode(node.id)
    }
  }
}

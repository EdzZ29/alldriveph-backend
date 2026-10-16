import { Injectable } from '@nestjs/common';
import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';

import type { RequestContext } from '../../common/context';
import { CrudService } from '../../common/crud.service';
import { LiveHub } from '../../common/live.hub';
import { read, write, type Operations } from '../../common/operations';
import { paginate } from '../../common/pagination';
import type { CacheTag } from '../../common/revalidate.service';
import { readingMinutes } from '../../common/utils';
import {
  LookupArgs,
  idAndInput,
  idArg,
  inputArg,
  uuidArg,
  validateArgs,
} from '../../common/validation';
import {
  faqView,
  messageView,
  partnerView,
  postAdmin,
  postDetail,
  postSummary,
  serviceView,
} from '../../common/views';
import { settings } from '../../config/settings';
import {
  BlogPost,
  ContactMessage,
  Faq,
  Partner,
  Service,
} from '../../entities/content.entity';
import {
  BlogPostInput,
  BlogPostUpdateInput,
  ContactInput,
  ContentListArgs,
  FaqInput,
  FaqListArgs,
  FaqUpdateInput,
  MessageListArgs,
  MessageUpdateArgs,
  PartnerInput,
  PartnerUpdateInput,
  PostListArgs,
  ServiceInput,
  ServiceUpdateInput,
  SlugArgs,
} from './content.inputs';

const MAX_ADMIN_POSTS = 1000;
const PUBLISHED = 'post.is_published = true AND post.published_at <= now()';

/**
 * create_<name>, update_<name> and delete_<name> for a simple staff managed table. `crud` is a
 * getter because class fields are built before the constructor stores its services.
 */
function crudOperations<T extends { id: string; slug?: string }, R>(
  crud: () => CrudService,
  spec: {
    name: string;
    label: string;
    entity: EntityTarget<T>;
    create: new () => object;
    update: new () => object;
    view: (row: T) => R;
    revalidate: CacheTag[];
    slugFrom?: keyof T & string;
  },
): Operations {
  const { name, label, entity, view, revalidate, slugFrom } = spec;
  return {
    [`create_${name}`]: write(async (ctx, args) => {
      await ctx.requireStaff();
      const input = await inputArg(args, spec.create);
      return view(await crud().create(entity, input, { slugFrom, revalidate }));
    }),
    [`update_${name}`]: write(async (ctx, args) => {
      await ctx.requireStaff();
      const { id, input } = await idAndInput(args, spec.update);
      return view(
        await crud().update(entity, id, input, label, {
          slug: !!slugFrom,
          revalidate,
        }),
      );
    }),
    [`delete_${name}`]: write(async (ctx, args) => {
      await ctx.requireStaff();
      return crud().remove(entity, idArg(args), label, revalidate);
    }),
  };
}

@Injectable()
export class ContentOperations {
  constructor(
    private readonly dataSource: DataSource,
    private readonly crud: CrudService,
    private readonly hub: LiveHub,
  ) {}

  readonly operations: Operations = {
    // ---------- services, partners, FAQs ----------

    /** include_inactive (staff only) adds hidden services. */
    services: read(async (ctx, args) => {
      const a = await validateArgs(ContentListArgs, args);
      const rows = await this.list(ctx, Service, !!a.include_inactive, [
        ['sort_order', 'ASC'],
        ['title', 'ASC'],
      ]);
      return rows.map(serviceView);
    }),

    /** A visible service by slug. Null if not found. */
    service: read(async (_ctx, args) => {
      const { slug } = await validateArgs(SlugArgs, args);
      const row = await this.dataSource.manager.findOne(Service, {
        where: { slug, is_active: true },
      });
      return row && serviceView(row);
    }),

    /** include_inactive (staff only) adds hidden partners. */
    partners: read(async (ctx, args) => {
      const a = await validateArgs(ContentListArgs, args);
      const rows = await this.list(ctx, Partner, !!a.include_inactive, [
        ['sort_order', 'ASC'],
        ['name', 'ASC'],
      ]);
      return rows.map(partnerView);
    }),

    /** include_inactive (staff only) adds hidden questions. */
    faqs: read(async (ctx, args) => {
      const a = await validateArgs(FaqListArgs, args);
      const rows = await this.list(
        ctx,
        Faq,
        !!a.include_inactive,
        [
          ['category', 'ASC'],
          ['sort_order', 'ASC'],
        ],
        a.category
          ? ['row.category = :category', { category: a.category }]
          : undefined,
      );
      return rows.map(faqView);
    }),

    ...crudOperations(() => this.crud, {
      name: 'service',
      label: 'Service',
      entity: Service,
      create: ServiceInput,
      update: ServiceUpdateInput,
      view: serviceView,
      revalidate: ['services'],
      slugFrom: 'title',
    }),
    ...crudOperations(() => this.crud, {
      name: 'partner',
      label: 'Partner',
      entity: Partner,
      create: PartnerInput,
      update: PartnerUpdateInput,
      view: partnerView,
      revalidate: ['partners'],
    }),
    ...crudOperations(() => this.crud, {
      name: 'faq',
      label: 'Faq',
      entity: Faq,
      create: FaqInput,
      update: FaqUpdateInput,
      view: faqView,
      revalidate: ['faqs'],
    }),

    // ---------- blog ----------

    /** Published articles, newest first. include_drafts (staff only) lists every article. */
    posts: read(async (ctx, args) => {
      const a = await validateArgs(PostListArgs, args);
      const drafts = !!a.include_drafts;
      const query = this.dataSource.createQueryBuilder(BlogPost, 'post');
      if (drafts) {
        await ctx.requireStaff();
        query.orderBy('post.created_at', 'DESC');
      } else {
        query.where(PUBLISHED).orderBy('post.published_at', 'DESC');
      }
      if (a.tag)
        query.andWhere(':tag = ANY(post.tags)', { tag: a.tag.slice(0, 40) });
      const term = a.q?.trim().slice(0, 80);
      if (term) {
        query.andWhere('(post.title ILIKE :term OR post.excerpt ILIKE :term)', {
          term: `%${term}%`,
        });
      }
      return paginate(
        query,
        a.page ?? 1,
        a.page_size ?? 9,
        drafts ? postAdmin : postSummary,
        drafts ? MAX_ADMIN_POSTS : 100,
      );
    }),

    /** A published article by slug, or any article by id (staff only). Null if not found. */
    post: read(async (ctx, args) => {
      const { slug, id } = await validateArgs(LookupArgs, args);
      if (id) {
        await ctx.requireStaff();
        const row = await this.dataSource.manager.findOne(BlogPost, {
          where: { id },
        });
        return row && postAdmin(row);
      }
      if (!slug) return null;
      const row = await this.dataSource
        .createQueryBuilder(BlogPost, 'post')
        .where('post.slug = :slug', { slug })
        .andWhere(PUBLISHED)
        .getOne();
      return row && postDetail(row);
    }),

    create_post: write(async (ctx, args) => {
      await ctx.requireStaff();
      const input = await inputArg(args, BlogPostInput);
      const row = await this.crud.create(
        BlogPost,
        {
          ...input,
          reading_minutes: readingMinutes(input.content),
          published_at: input.is_published ? new Date() : undefined,
        },
        { slugFrom: 'title', revalidate: ['blog'] },
      );
      return postAdmin(row);
    }),

    update_post: write(async (ctx, args) => {
      await ctx.requireStaff();
      const { id, input } = await idAndInput(args, BlogPostUpdateInput);
      const row = await this.crud.update(BlogPost, id, input, 'Article', {
        slug: true,
        revalidate: ['blog'],
        prepare: (post, changes) => {
          if (changes.content !== undefined) {
            changes.reading_minutes = readingMinutes(changes.content);
          }
          if (changes.is_published && !post.published_at)
            changes.published_at = new Date();
        },
      });
      return postAdmin(row);
    }),

    delete_post: write(async (ctx, args) => {
      await ctx.requireStaff();
      return this.crud.remove(BlogPost, idArg(args), 'Article', ['blog']);
    }),

    // ---------- contact form and inbox ----------

    /** The website contact form. */
    send_contact_message: write(async (ctx, args) => {
      await ctx.rateLimit(
        settings.rateLimitPublicWrite,
        'send_contact_message',
      );
      const input = await inputArg(args, ContactInput);
      const thanks = { message: 'Thanks! We will get back to you shortly.' };
      // honeypot tripped: pretend success so bots learn nothing
      if (input.website) return thanks;
      const manager = this.dataSource.manager;
      const saved = await manager.save(
        manager.create(ContactMessage, {
          name: input.name.trim(),
          email: input.email.toLowerCase(),
          phone: input.phone?.trim() || null,
          subject: input.subject.trim(),
          message: input.message.trim(),
        }),
      );
      this.hub.publish({
        type: 'contact',
        contact: { id: saved.id, name: saved.name, subject: saved.subject },
      });
      return thanks;
    }),

    /** Staff only. Contact form messages, newest first. */
    messages: read(async (ctx, args) => {
      await ctx.requireStaff();
      const a = await validateArgs(MessageListArgs, args);
      const query = this.dataSource
        .createQueryBuilder(ContactMessage, 'msg')
        .orderBy('msg.created_at', 'DESC');
      if (a.unread) query.where('msg.is_read = false');
      return paginate(query, a.page ?? 1, a.page_size ?? 20, messageView);
    }),

    update_message: write(async (ctx, args) => {
      await ctx.requireStaff();
      const a = await validateArgs(MessageUpdateArgs, args);
      const row = await this.crud.update(
        ContactMessage,
        uuidArg(a.id),
        { is_read: a.is_read },
        'Message',
      );
      return messageView(row);
    }),

    delete_message: write(async (ctx, args) => {
      await ctx.requireStaff();
      return this.crud.remove(ContactMessage, idArg(args), 'Message');
    }),
  };

  /** Visible rows, or every row for staff when include_inactive is set. */
  private async list<T extends ObjectLiteral>(
    ctx: RequestContext,
    entity: EntityTarget<T>,
    includeInactive: boolean,
    order: [string, 'ASC' | 'DESC'][],
    where?: [string, Record<string, unknown>],
  ): Promise<T[]> {
    const query = this.dataSource.createQueryBuilder(entity, 'row');
    if (includeInactive) await ctx.requireStaff();
    else query.andWhere('row.is_active = true');
    if (where) query.andWhere(...where);
    for (const [column, direction] of order)
      query.addOrderBy(`row.${column}`, direction);
    return query.getMany();
  }
}

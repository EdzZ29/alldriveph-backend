import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

import { Identified, Timestamped, numeric } from './base';

@Entity('services')
export class Service extends Timestamped {
  @Index('ix_services_slug', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 300 })
  summary: string;

  @Column('text')
  description: string = '';

  @Column({ type: 'varchar', length: 40 })
  icon: string = 'car';

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numeric,
  })
  price_from: number | null = null;

  @Column({ type: 'varchar', length: 120, array: true })
  highlights: string[] = [];

  @Column('int')
  sort_order: number = 0;

  @Column('boolean')
  is_active: boolean = true;
}

@Entity('partners')
export class Partner extends Timestamped {
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  category: string;

  @Column({ type: 'varchar', length: 400 })
  description: string = '';

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_url: string | null = null;

  /** Optional wide photo or banner shown at the top of the partner card. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url: string | null = null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  website_url: string | null = null;

  @Column('int')
  sort_order: number = 0;

  @Column('boolean')
  is_active: boolean = true;
}

@Entity('faqs')
export class Faq extends Timestamped {
  @Column({ type: 'varchar', length: 300 })
  question: string;

  @Column('text')
  answer: string;

  @Index('ix_faqs_category')
  @Column({ type: 'varchar', length: 60 })
  category: string = 'General';

  @Column('int')
  sort_order: number = 0;

  @Column('boolean')
  is_active: boolean = true;
}

@Entity('blog_posts')
export class BlogPost extends Timestamped {
  @Index('ix_blog_posts_slug', { unique: true })
  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 400 })
  excerpt: string;

  @Column('text')
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cover_image_url: string | null = null;

  @Column({ type: 'varchar', length: 120 })
  author_name: string = 'Alldrive Team';

  @Column({ type: 'varchar', length: 40, array: true })
  tags: string[] = [];

  @Column('int')
  reading_minutes: number = 3;

  @Index('ix_blog_posts_is_published')
  @Column('boolean')
  is_published: boolean = false;

  @Index('ix_blog_posts_published_at')
  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null = null;
}

@Entity('contact_messages')
export class ContactMessage extends Identified {
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null = null;

  @Column({ type: 'varchar', length: 160 })
  subject: string;

  @Column('text')
  message: string;

  @Index('ix_contact_messages_is_read')
  @Column('boolean')
  is_read: boolean = false;

  @Index('ix_contact_messages_created_at')
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * App-wide link: preloads the whole next screen as soon as the link is on screen (not just its
 * loading skeleton), so tapping opens it instantly. Pass prefetch={false} for rarely used links.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={props.prefetch ?? true} />;
}

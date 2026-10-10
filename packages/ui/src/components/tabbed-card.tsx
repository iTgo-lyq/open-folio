"use client";

import type { ComponentProps, ReactNode } from "react";
import { Card, CardContent } from "./card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { cn } from "../utils";

export type TabbedCardItem = {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
};
export type TabbedCardProps = Omit<
  ComponentProps<typeof Tabs>,
  "children" | "orientation"
> & {
  /** Accessible name for the tab list. Values must be unique and stable. */
  label: string;
  items: readonly TabbedCardItem[];
};
export function TabbedCard({
  items,
  label,
  className,
  defaultValue = items.find((item) => !item.disabled)?.value,
  ...props
}: TabbedCardProps) {
  return (
    <Tabs
      {...props}
      defaultValue={defaultValue}
      className={cn("of-ui-tabbed-card", className)}
    >
      <Card>
        <div className="of-ui-tabbed-card-nav">
          <TabsList variant="line" aria-label={label}>
            {items.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                disabled={item.disabled}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <CardContent>
          {items.map((item) => (
            <TabsContent key={item.value} value={item.value}>
              {item.content}
            </TabsContent>
          ))}
        </CardContent>
      </Card>
    </Tabs>
  );
}

"use client";

import { useId } from "react";
import { X } from "lucide-react";
import {
  Avatar,
  Button,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
} from "@open-folio/ui";
import type { ChangeGroup } from "@/lib/model";
import styles from "./change-collaborators.module.css";

export function ChangeCollaborators({ change }: { change: ChangeGroup }) {
  const heading = useId();
  const members =
    change.collaborators ?? (change.creator ? [change.creator] : []);
  if (!members.length) return <span className={styles.unknown}>—</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={styles.trigger}
          data-collaborators-for={change.id}
          aria-label={`查看 ${members.length} 位协作者：${change.title}`}
        >
          <span className={styles.avatars}>
            {members.slice(0, 3).map((member, i) => (
              <Avatar key={i} name={member.name} />
            ))}
          </span>
          {members.length > 3 ? (
            <span className={styles.more}>+{members.length - 3}</span>
          ) : members.length === 1 ? (
            <span className={styles.name}>{members[0].name}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={styles.popover}
        aria-labelledby={heading}
      >
        <div className={styles.heading}>
          <strong id={heading}>
            协作者 <span>{members.length}</span>
          </strong>
          <PopoverClose asChild>
            <IconButton aria-label="关闭协作者">
              <X />
            </IconButton>
          </PopoverClose>
        </div>
        <p className={styles.note}>创建者排第一，其余为参与推进的成员</p>
        <ul className={styles.members} aria-label="完整协作者名单">
          {members.map((member, i) => (
            <li key={i}>
              <Avatar name={member.name} />
              <span className={styles.identity}>
                <strong>{member.name}</strong>
                {member.login && <small>@{member.login}</small>}
              </span>
              <span className={styles.role}>
                {i === 0 && change.creator ? "创建者" : "参与推进"}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

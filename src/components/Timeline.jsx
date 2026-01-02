import React from "react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import { LucideArrowUpZA } from "lucide-react";

export default function Timeline({ posts }) {
  return (
    <VerticalTimeline>
      {posts.map((post) => (
        <VerticalTimelineElement
          key={post.slug}
          date={
            <span
              style={{
                fontWeight: "700",
                color: "var(--primary-color)",
                fontSize: "0.9rem",
              }}>
              {new Date(post.data.pubDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          }
          contentStyle={{
            background: "#f2eede",
            color: "#333",
            borderRadius: "1rem",
          }}
          contentArrowStyle={{ borderRight: "7px solid  var(--primary-color)" }}
          iconStyle={{ background: "var(--primary-color)", color: "#fff" }}>
          {post.data.heroImage && (
            <img
              src={post.data.heroImage.src}
              alt={post.data.title}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                marginBottom: "1.5rem",
              }}
            />
          )}
          <h3
            style={{
              fontSize: "1.5rem",
              marginBottom: "0.5rem",
              fontWeight: "700"
            }}>
            {post.data.title}
          </h3>
          <p>{post.data.description}</p>
          <a
            href={`/blog/${post.id}`}
            style={{
              color: "var(--primary-color)",
              fontWeight: "bold",
              textDecoration: "none",
              fontSize: "1rem",
            }}>
            Read full update →
          </a>
        </VerticalTimelineElement>
      ))}
    </VerticalTimeline>
  );
}
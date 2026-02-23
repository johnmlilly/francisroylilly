import React from "react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";
import { CalendarDays } from "lucide-react";

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
                fontSize: "1.1rem",
              }}>
              {new Date(post.data.pubDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
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
          iconStyle={{ background: "var(--primary-color)", color: "#fff" }}
          icon={<CalendarDays />}>
          {post.data.heroImage && (
            <img
              src={post.data.heroImage.src}
              width={post.data.heroImage.width}
              height={post.data.heroImage.height}
              alt={post.data.title}
              loading="lazy"
              decoding="async"
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
              fontWeight: "700",
              color: "var(--secondary-color)",
            }}>
            {post.data.title}
          </h3>
          <p>{post.data.description}</p>
          <div className="flex gap-1">
            <a
              href={`/blog/${post.id}`}
              style={{
                display: "inline-block",
                marginBlock: "1rem 0",
                padding: "0.25rem 0.75rem",
                fontSize: "0.9rem",
                fontWeight: "bold",
                color: "var(--primary-color)",
                textDecoration: "none",
                border: "2px solid var(--primary-color)",
                borderRadius: "0.5rem",
                backgroundColor: "transparent",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => (
                (e.currentTarget.style.backgroundColor =
                  "var(--primary-color)"),
                (e.currentTarget.style.color = "white")
              )}
              onMouseLeave={(e) => (
                (e.currentTarget.style.backgroundColor = "transparent"),
                (e.currentTarget.style.color = "var(--primary-color)")
              )}>
              Read full update →
            </a>
          </div>
        </VerticalTimelineElement>
      ))}
    </VerticalTimeline>
  );
}

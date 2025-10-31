import React from "react";
import {
  VerticalTimeline,
  VerticalTimelineElement,
} from "react-vertical-timeline-component";
import "react-vertical-timeline-component/style.min.css";

export default function Timeline({ posts }) {
  return (
    <VerticalTimeline>
      {posts.map((post) => (
        <VerticalTimelineElement
          key={post.slug}
          date={new Date(post.data.pubDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
            contentStyle={{ background: "#f7f3fc", color: "#333", borderRadius: "1rem" }}
            contentArrowStyle={{ borderRight: "7px solid  #6B46C1" }}
            iconStyle={{ background: "#6B46C1", color: "#fff" }}
        >
          <h3 className="vertical-timeline-element-title">{post.data.title}</h3>
          {post.data.image && (
            <img
              src={post.data.image}
              alt={post.data.title}
              style={{ width: "100%" }}
            />
          )}
          <p>{post.data.description}</p>
          <a
            href={`/blog/${post.id}`}
            style={{ color: "#6B46C1", fontWeight: "bold", textDecoration: "none" }}
          >
            Read full update →
          </a>
        </VerticalTimelineElement>
      ))}
    </VerticalTimeline>
  );
}
import React from "react";
import ImageGallery from "react-image-gallery";
import "react-image-gallery/styles/image-gallery.css";

export default function Carousel({ photos }) {
  const images = photos.map((photo) => ({
    original: photo,
    thumbnail: photo,
  }));

  return (
    <div style={{ margin: "2rem 0" }}>
      <ImageGallery
        items={images}
        showPlayButton={false}
        showFullscreenButton={false}
      />
    </div>
  );
}

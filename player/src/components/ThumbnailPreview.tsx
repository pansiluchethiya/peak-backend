interface Props {
  thumbnailUrl?: string;
  timeFormatted: string;
}

export function ThumbnailPreview({ thumbnailUrl, timeFormatted }: Props) {
  return (
    <div className="thumbnail-preview-card" role="tooltip">
      {thumbnailUrl && (
        <div className="thumbnail-image-wrapper">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl} alt={`Preview at ${timeFormatted}`} className="thumbnail-image" />
        </div>
      )}
      <span className="thumbnail-time-badge">{timeFormatted}</span>
    </div>
  );
}

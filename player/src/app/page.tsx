import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-glow" />
      <section className="landing-card">
        <img src="/logo.svg" alt="" className="landing-logo" />
        <p className="landing-kicker">PeakMovies Player</p>
        <h1>One iframe. Fully branded.</h1>
        <p className="landing-copy">
          Embed the player anywhere with a movie or TV route. No third-party UI, no ads, just your
          brand and the stream.
        </p>
        <pre className="landing-code">{`<iframe
  src="https://yourdomain.com/player/movie/27205"
  style="width:100%;aspect-ratio:16/9;border:none"
  allow="autoplay; fullscreen; picture-in-picture"
/>`}</pre>
        <div className="landing-actions">
          <Link className="button primary" href="/movie/27205">
            Preview a movie
          </Link>
          <Link className="button ghost" href="/tv/1396/1/1">
            Preview a TV episode
          </Link>
        </div>
      </section>
    </main>
  );
}

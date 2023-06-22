import React from 'react';
import { DefaultTheme, withStyles, WithStyles } from '@material-ui/styles';
import { Typography, Button, IconButton, Backdrop, CircularProgress } from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import PauseIcon from '@material-ui/icons/Pause';
import StopIcon from '@material-ui/icons/Stop';
import { RouteComponentProps } from 'react-router-dom'

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}

const styles = (theme: DefaultTheme) => ({
  pageTitle: {
    fontSize: '20pt !important',
    borderBottom: 'solid 1pt',
    paddingBottom: '2px',
  },
  tableContainer: {
    marginTop: '12px'
  },
  songRow: {
    cursor: 'pointer'
  },
  timeSpan: {
    padding: '12px'
  },
  divisionButton: {
    marginRight: '6px'
  },
  divisionButtonRow: {
    marginTop: '6px'
  },
  loadingText: {
    paddingLeft: '12px'
  },
  cursor: {
    cursor: 'pointer'
  }
});

interface Props extends RouteComponentProps<{}>, WithStyles<typeof styles> {
}

interface State {
  initialized: boolean, currentTime: number, duration: number,
  info: SongInfo | undefined, detailInfo: SongDetailInfo | undefined,
  segments: { start: number, end: number, flags: boolean[] }[],
  zoomStart: number, zoomEnd: number;
}

interface SongInfo {
  title: string, artist: string, slug: string;
}

interface SongDetailInfo {
  bgm: string, vocals: string[], artists: string[], segments: SegmentInfo[];
}

interface SegmentInfo {
  start: number, end: number, singers: number[];
}

class SongView extends React.Component<Props, State> {
  readonly masterVolume: number = 0.8;
  readonly audioContext: AudioContext;
  readonly compressor: DynamicsCompressorNode;
  bgmBuffer: AudioBuffer | undefined;
  bgmSource: AudioBufferSourceNode | undefined;
  bgmGain: GainNode | undefined;
  vocalBuffers: AudioBuffer[] | undefined;
  vocalSources: AudioBufferSourceNode[] | undefined;
  vocalGains: GainNode[] | undefined;
  isPlaying: boolean = false;
  startTime: number = 0;
  pauseTime: number = 0;
  mainTimer: NodeJS.Timeout | undefined;
  timerHistory: number[] = [];
  zoomDragging: null | 'bar' | 'start' | 'end' = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      initialized: false, currentTime: this.pauseTime, duration: 0,
      info: undefined, detailInfo: undefined, segments: [],
      zoomStart: 0, zoomEnd: 30
    };
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.connect(this.audioContext.destination);
  }

  componentDidMount() {
    this.loadInfo();
  }

  componentWillUnmount() {
    if (this.mainTimer) {
      clearTimeout(this.mainTimer);
    }
    this.stopSamples();
    this.compressor.disconnect();
    this.audioContext.close();
    this.bgmBuffer = undefined;
    this.vocalBuffers = undefined;
  }

  async loadInfo() {
    const queries = new URLSearchParams(this.props.location.search);
    const slug = queries.get('s');
    if (slug === null) {
      this.props.history.push('/');
      return;
    }
    await Promise.all([this.loadSongInfo(slug), this.loadSongDetailInfo(slug)])
    this.setState(state => ({ initialized: true }));
    this.update();
  }

  async loadSongInfo(slug: string) {
    const response = await fetch('list.json');
    const json = await response.json() as SongInfo[];
    const info = json.find((e) => e.slug === slug);
    if (info === undefined) {
      this.props.history.push('/');
    }
    this.setState(state => ({ info: info }));
  }

  async loadSongDetailInfo(slug: string) {
    const response = await fetch(`${slug}/${slug}.json`);
    const json = await response.json() as SongDetailInfo;
    const segments = json.segments.map((e) => (
      { start: e.start, end: e.end, flags: json.vocals.map((_, i) => e.singers.includes(i)) }
    ));
    this.setState(state => ({ detailInfo: json, segments: segments }));
    await this.loadBuffers(json);
  }

  async loadBuffers(info: SongDetailInfo) {
    await Promise.all([this.loadBgmBuffer(info), this.loadVocalBuffers(info)]);
  }

  async loadBgmBuffer(info: SongDetailInfo) {
    const response = await fetch(info.bgm);
    const arrayBuffer = await response.arrayBuffer();
    this.bgmBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.setState(state => ({ duration: this.bgmBuffer?.duration || 0 }));
  }

  async loadVocalBuffers(info: SongDetailInfo) {
    this.vocalBuffers = await Promise.all(info.vocals.map(async (e) => {
      const response = await fetch(e);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    }));
  }

  playSamples = () => {
    if (!this.bgmBuffer || !this.vocalBuffers || this.isPlaying)
      return;
    this.bgmSource = this.audioContext.createBufferSource();
    this.bgmSource.buffer = this.bgmBuffer;
    this.bgmGain = this.audioContext.createGain();
    this.bgmGain.gain.value = this.masterVolume;
    this.bgmSource.connect(this.bgmGain);
    this.bgmGain.connect(this.compressor);
    this.bgmSource.onended = this.stopSamples;

    this.vocalSources = this.vocalBuffers.map((e) => {
      const source = this.audioContext.createBufferSource();
      source.buffer = e;
      return source;
    });
    this.vocalGains = this.vocalSources.map((e) => {
      const gain = this.audioContext.createGain();
      e.connect(gain);
      gain.gain.value = 0;
      gain.connect(this.compressor);
      return gain;
    });
    this.bgmSource.start(0, this.pauseTime);
    this.vocalSources.forEach((e) => e.start(0, this.pauseTime));
    this.startTime = this.audioContext.currentTime;
    this.isPlaying = true;
  }

  pauseSamples = () => {
    if (!this.isPlaying)
      return;
    if (this.bgmSource) {
      this.bgmSource.onended = null;
      this.bgmSource.stop();
      this.bgmSource.disconnect();
    }
    this.bgmGain?.disconnect();
    this.vocalSources?.forEach((e) => { e.stop(); e.disconnect(); e.buffer = null; });
    this.vocalGains?.forEach((e) => { e.disconnect(); });
    this.isPlaying = false;
    this.pauseTime = this.audioContext.currentTime - this.startTime + this.pauseTime;
  }

  stopSamples = () => {
    if (!this.isPlaying) {
      this.pauseTime = 0;
      return;
    }
    if (this.bgmSource) {
      this.bgmSource.onended = null;
      this.bgmSource.stop();
      this.bgmSource.disconnect();
    }
    this.bgmGain?.disconnect();
    this.vocalSources?.forEach((e) => { e.stop(); e.disconnect(); e.buffer = null; });
    this.vocalGains?.forEach((e) => { e.disconnect(); });
    this.isPlaying = false;
    this.pauseTime = 0;
  }

  seekSamples = (position: number) => {
    if (this.isPlaying) {
      this.pauseSamples();
      this.pauseTime = position;
      this.playSamples();
    } else {
      this.pauseTime = position;
    }

    this.setState((s) => {
      const len = s.zoomEnd - s.zoomStart;
      let zoomStart = s.zoomStart;
      let zoomEnd = s.zoomEnd;
      if (!(zoomStart <= position && position <= zoomEnd)) {
        zoomStart = position - len / 2;
        zoomEnd = position + len / 2;
        if (zoomStart < 0) {
          zoomStart = 0;
          zoomEnd = len;
        } else if (zoomEnd > s.duration) {
          zoomStart = s.duration - len;
          zoomEnd = s.duration;
        }
      }
      return { currentTime: position, zoomStart: zoomStart, zoomEnd: zoomEnd };
    });
  }

  update = () => {
    let averageTime = 5;
    this.timerHistory.push(performance.now());
    while (this.timerHistory.length > 101) {
      this.timerHistory.shift();
    }
    if (this.timerHistory.length >= 2) {
      averageTime = (this.timerHistory[this.timerHistory.length - 1] - this.timerHistory[0]) / (this.timerHistory.length - 1);
    }

    const currentTime = this.isPlaying ? this.audioContext.currentTime - this.startTime + this.pauseTime : this.pauseTime;
    this.setState((s) => {
      let zoomStart = s.zoomStart;
      let zoomEnd = s.zoomEnd;
      if (!(s.zoomStart <= currentTime && currentTime <= s.zoomEnd) && (s.zoomStart <= s.currentTime && s.currentTime <= s.zoomEnd)) {
        const len = s.zoomEnd - s.zoomStart;
        zoomStart = currentTime;
        zoomEnd = currentTime + len;
        if (zoomEnd > s.duration) {
          zoomEnd = s.duration;
          zoomStart = s.duration - len;
        }
      }
      return { currentTime: currentTime, zoomStart: zoomStart, zoomEnd: zoomEnd };
    });
    if (this.isPlaying) {
      if (this.vocalGains) {
        let seg_found = false;
        const currentOffsetTime = currentTime + averageTime / 2000;
        for (let i = 0; i < this.state.segments.length; i++) {
          const seg = this.state.segments[i];
          if (currentOffsetTime <= seg.start) {
            break;
          }
          if (seg.start <= currentOffsetTime && currentOffsetTime < seg.end) {
            seg_found = true;
            let count = 0;
            seg.flags.forEach((e) => { if (e) ++count; });
            this.vocalGains.forEach((e, j) => { e.gain.value = seg.flags[j] ? this.masterVolume / Math.sqrt(count) : 0; });
            break;
          }
        }
        if (!seg_found) {
          this.vocalGains.forEach((e) => { e.gain.value = 0 });
        }
      }
    }
    this.mainTimer = setTimeout(this.update, 5);
  }

  prettifyTime(s: number) {
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
  }

  handleDivisionButton(singer: number) {
    switch (singer) {
      case -4: //random 2
        this.setState((s) => {
          if (s.detailInfo) {
            const vocals = s.detailInfo.vocals;
            const a = vocals.map(() => Math.random());
            const b = vocals.map((_, i) => i);
            b.sort((v1, v2) => a[v1] - a[v2]);
            return {
              segments: s.detailInfo.segments.map((e) => {
                const flags = vocals.map((_, i) => e.singers.includes(b[i]));
                return { start: e.start, end: e.end, flags: flags };
              })
            }
          } else {
            return { segments: [] };
          }
        });
        break;
      case -3: //random 1
        this.setState((s) => {
          if (s.detailInfo) {
            const vocals = s.detailInfo.vocals;
            let markov1: number[] = [];
            let markov2: number[] = [];
            return {
              segments: s.detailInfo.segments.map((e) => {
                let count = 0;
                vocals.forEach((_, i) => {
                  if (e.singers.includes(i)) {
                    ++count;
                  }
                });
                const a = vocals.map(() => Math.random()).map((e, i) => markov1.includes(i) ? e + 0.8 : e).map((e, i) => markov2.includes(i) ? e + 0.4 : e);
                const b = vocals.map((_, i) => i);
                b.sort((v1, v2) => a[v1] - a[v2]);
                const c = b.slice(0, count);
                markov2 = markov1;
                markov1 = c;
                const flags = vocals.map((_, i) => c.includes(i));
                return { start: e.start, end: e.end, flags: flags };
              })
            }
          } else {
            return { segments: [] };
          }
        });
        break;
      case -2: // clear
        this.setState((s) => {
          if (s.detailInfo) {
            const vocals = s.detailInfo.vocals;
            return {
              segments: s.detailInfo.segments.map((e) => (
                { start: e.start, end: e.end, flags: vocals.map(() => false) }
              ))
            }
          } else {
            return { segments: [] };
          }
        });
        break;
      case -1: // default
        this.setState((s) => {
          if (s.detailInfo) {
            const vocals = s.detailInfo.vocals;
            return {
              segments: s.detailInfo.segments.map((e) => (
                { start: e.start, end: e.end, flags: vocals.map((_, i) => e.singers.includes(i)) }
              ))
            }
          } else {
            return { segments: [] };
          }
        });
        break;
      default:
        this.setState((s) => {
          if (s.detailInfo) {
            const vocals = s.detailInfo.vocals;
            return {
              segments: s.detailInfo.segments.map((e) => (
                { start: e.start, end: e.end, flags: vocals.map((_, i) => i === singer) }
              ))
            }
          } else {
            return { segments: [] };
          }
        });
    }
  }

  switchDivisionState(segmentIndex: number, singerIndex: number) {
    this.setState((s) => {
      let seg = s.segments.map((e) => ({ start: e.start, end: e.end, flags: new Array(...e.flags) }));
      seg[segmentIndex].flags[singerIndex] = !seg[segmentIndex].flags[singerIndex];
      return { segments: seg };
    });
  }

  handleSeek = (e: any) => {
    const svg = (document.getElementById('main-svg') as unknown) as SVGSVGElement;
    let p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    const point = p.matrixTransform(ctm);
    this.seekSamples(this.state.duration * point.x / svg.clientWidth);
  };

  handleSeekZoom = (e: any) => {
    const svg = (document.getElementById('main-svg') as unknown) as SVGSVGElement;
    let p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    const point = p.matrixTransform(ctm);
    this.seekSamples(this.state.zoomStart + (this.state.zoomEnd - this.state.zoomStart) * point.x / svg.clientWidth);
  };

  handleZoomDown = (id: 'bar' | 'start' | 'end', e: any) => {
    this.zoomDragging = id;
  }

  handleMouseMove = (e: any) => {
    if (this.zoomDragging === null) {
      return;
    }
    const svg = (document.getElementById('main-svg') as unknown) as SVGSVGElement;
    let p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    const point = p.matrixTransform(ctm);
    const pos = this.state.duration * point.x / svg.clientWidth;

    switch (this.zoomDragging) {
      case 'start':
        this.setState((s) => {
          const zoomStart = s.zoomEnd - 1 < pos ? s.zoomEnd - 1 : pos;
          return { zoomStart: zoomStart < 0 ? 0 : zoomStart };
        });
        break;
      case 'end':
        this.setState((s) => {
          const zoomEnd = s.zoomStart + 1 > pos ? s.zoomStart + 1 : pos;
          return { zoomEnd: zoomEnd > s.duration ? s.duration : zoomEnd };
        });
        break;
      case 'bar':
        this.setState((s) => {
          const len = s.zoomEnd - s.zoomStart;
          let zoomStart = pos - len / 2;
          let zoomEnd = pos + len / 2;
          if (zoomStart < 0) {
            zoomStart = 0;
            zoomEnd = len;
          } else if (zoomEnd > s.duration) {
            zoomStart = s.duration - len;
            zoomEnd = s.duration;
          }
          return { zoomStart: zoomStart, zoomEnd: zoomEnd };
        });
        break;
    }
  }

  handleMouseUp = (e: any) => {
    this.zoomDragging = null;
  }

  render() {
    const { classes } = this.props;

    let svg = <></>;
    if (this.state.detailInfo) {
      const vocals = this.state.detailInfo.vocals;
      const cursorPosition = this.state.duration === 0 ? 0 : this.state.currentTime / this.state.duration * 100;
      svg =
        <svg width="100%" height={70 * vocals.length + 80} id="main-svg" onMouseMove={this.handleMouseMove} onMouseUp={this.handleMouseUp}>
          {
            vocals.map((e, i) =>
              <rect height="26" width="100%" x="0" y={20 + 30 * i} fill="#eee" key={`svg-base-bar-${i}`}></rect>
            )
          }
          {
            this.state.duration === 0 ? <></> : this.state.segments.flatMap(
              (e, j) => e.flags.map(
                (flag, i) => {
                  const start = e.start / this.state.duration * 100;
                  const duration = (e.end - e.start) / this.state.duration * 100;
                  return <svg height="26" width={`${duration}%`} x={`${start}%`} y={20 + 30 * i} onClick={this.switchDivisionState.bind(this, j, i)} className={classes.cursor} key={`svg-part-button-${j}-${i}`}>
                    <rect x="0" y="0" width="100%" height="100%" fill={flag ? '#58a6dc' : '#bbb'} stroke="#eee" strokeWidth="2" />
                  </svg>;
                }
              )
            )
          }
          <g transform="translate(-1 0)">
            <svg x={`${cursorPosition}%`} y="16" height={5 + 30 * vocals.length} width="2" preserveAspectRatio="none">
              <rect x="0" y="0" width="100%" height="100%" fill="#ee762e"></rect>
            </svg>
          </g>
          <g transform="translate(-8 0)">
            <svg x={`${cursorPosition}%`} y="8" height="100%" width="16" preserveAspectRatio="none">
              <polygon points="0,0 8,10 16,0 " fill="#ee762e" />
            </svg>
          </g>
          <rect height="12" width="100%" x="0" y="8" pointerEvents="visible" fill="none" onClick={this.handleSeek} className={classes.cursor}></rect>
          <rect height="8" width="100%" x="0" y={26 + 30 * vocals.length} fill="#eee" className={classes.cursor} onMouseDown={this.handleZoomDown.bind(this, 'bar')} />
          <rect height="8" width={`${(this.state.zoomEnd - this.state.zoomStart) / this.state.duration * 100}%`} x={`${this.state.zoomStart / this.state.duration * 100}%`} y={26 + 30 * vocals.length} fill="#6495cf" className={classes.cursor} onMouseDown={this.handleZoomDown.bind(this, 'bar')} />
          {/* <line x1={`${this.state.zoomStart / this.state.duration * 100}%`} y1={30 + 30 * vocals.length} x2="0" y2={75 + 30 * vocals.length} stroke="#6495cf" strokeWidth="2" strokeDasharray="4 1"/> */}
          {/* <line x1={`${this.state.zoomEnd / this.state.duration * 100}%`} y1={30 + 30 * vocals.length} x2="100%" y2={75 + 30 * vocals.length} stroke="#6495cf" strokeWidth="2" strokeDasharray="4 1"/> */}
          <g transform="translate(-10 0)">
            <svg x={`${this.state.zoomStart / this.state.duration * 100}%`} y={20 + 30 * vocals.length} width="20" height="20" className={classes.cursor} onMouseDown={this.handleZoomDown.bind(this, 'start')}>
              <circle cx="10" cy="10" r="8" fill="#98bae3" stroke="#6495cf" strokeWidth="4" />
            </svg>
            <svg x={`${this.state.zoomEnd / this.state.duration * 100}%`} y={20 + 30 * vocals.length} width="20" height="20" className={classes.cursor} onMouseDown={this.handleZoomDown.bind(this, 'end')}>
              <circle cx="10" cy="10" r="8" fill="#98bae3" stroke="#6495cf" strokeWidth="4" />
            </svg>
          </g>
          <svg x={`${this.state.zoomStart / (this.state.zoomEnd - this.state.zoomStart) * -100}%`} y={50 + 30 * vocals.length} width={`${this.state.duration / (this.state.zoomEnd - this.state.zoomStart) * 100}%`} height={40 * vocals.length + 30} id="zoom-svg">
            {
              vocals.map((e, i) =>
                <rect height="35" width="100%" x="0" y={30 + 40 * i} fill="#eee" key={`svg-zoom-base-bar-${i}`}></rect>
              )
            }
            {
              this.state.duration === 0 ? <></> : this.state.segments.flatMap(
                (e, j) => e.flags.map(
                  (flag, i) => {
                    const start = e.start / this.state.duration * 100;
                    const duration = (e.end - e.start) / this.state.duration * 100;
                    return <svg height="35" width={`${duration}%`} x={`${start}%`} y={30 + 40 * i} onClick={this.switchDivisionState.bind(this, j, i)} className={classes.cursor} key={`svg-zoom-part-button-${j}-${i}`}>
                      <rect x="0" y="0" width="100%" height="100%" fill={flag ? '#58a6dc' : '#bbb'} stroke="#eee" strokeWidth="2" />
                    </svg>;
                  }
                )
              )
            }
            <g transform="translate(-1 0)">
              <svg x={`${cursorPosition}%`} y="25" height={5 + 40 * vocals.length} width="2" preserveAspectRatio="none">
                <rect x="0" y="0" width="100%" height="100%" fill="#ee762e"></rect>
              </svg>
            </g>
            <g transform="translate(-8 0)">
              <svg x={`${cursorPosition}%`} y="17px" height="100%" width="16" preserveAspectRatio="none">
                <polygon points="0,0 8,10 16,0 " fill="#ee762e" />
              </svg>
            </g>
            <rect height="17" width="100%" x="0" y="13" pointerEvents="visible" fill="none" onClick={this.handleSeekZoom} className={classes.cursor}></rect>
          </svg>
        </svg>;
    }

    return (
      <React.Fragment>
        <Typography variant="h1" className={classes.pageTitle}>
          {this.state.info ? `${this.state.info.title} / ${this.state.info.artist}` : ''}
        </Typography>
        <div>
          <IconButton onClick={this.playSamples}><PlayArrowIcon /></IconButton>
          <IconButton onClick={this.pauseSamples}><PauseIcon /></IconButton>
          <IconButton onClick={this.stopSamples}><StopIcon /></IconButton>
          <span className={classes.timeSpan}>{this.prettifyTime(this.state.currentTime)} / {this.prettifyTime(this.state.duration)}</span>
        </div>
        <div className={classes.divisionButtonRow}>
          <span className={classes.divisionButton}>
            <Button variant="contained" onClick={this.handleDivisionButton.bind(this, -2)}>Clear</Button>
          </span>
          <span className={classes.divisionButton}>
            <Button variant="contained" onClick={this.handleDivisionButton.bind(this, -1)}>Default</Button>
          </span>
          <span className={classes.divisionButton}>
            <Button variant="contained" color="secondary" onClick={this.handleDivisionButton.bind(this, -3)}>Shuffle 1</Button>
          </span>
          <span className={classes.divisionButton}>
            <Button variant="contained" color="secondary" onClick={this.handleDivisionButton.bind(this, -4)}>Shuffle 2</Button>
          </span>
        </div>
        <div className={classes.divisionButtonRow}>
          {
            this.state.detailInfo?.artists?.map((e, i) =>
              <span className={classes.divisionButton} key={`solo-button-${i}`}>
                <Button variant="contained" onClick={this.handleDivisionButton.bind(this, i)}>{e} Solo</Button>
              </span>
            )
          }
        </div>

        <div>{svg}</div>

        <Backdrop open={!this.state.initialized}>
          <CircularProgress color="inherit" />
          <span className={classes.loadingText}>Now Loading...</span>
        </Backdrop>
      </React.Fragment>
    );
  }
}

export default withStyles(styles)(SongView);

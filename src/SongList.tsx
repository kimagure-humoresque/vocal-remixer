import React from 'react';
import { DefaultTheme, withStyles, WithStyles } from '@material-ui/styles';
import { TableContainer, Table, TableHead, TableBody, TableRow, TableCell, Paper, Typography } from '@material-ui/core';
import { RouteComponentProps } from 'react-router-dom'

const styles = (theme: DefaultTheme) => ({
  title: {
    fontSize: '20pt !important',
    borderBottom: 'solid 1pt',
    paddingBottom: '2px',
  },
  tableContainer: {
    marginTop: '12px',
    marginBottom: '24px'
  },
  songRow: {
    cursor: 'pointer'
  }
});

interface Props extends RouteComponentProps<{}>, WithStyles<typeof styles> {
}

interface State {
  list: Array<SongInfo>;
}

interface SongInfo {
  title: string, artist: string, slug: string;
}

class SongList extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { list: [] };
  }

  componentDidMount() {
    this.loadList();
  }

  async loadList() {
    const response = await fetch('list.json');
    const json = await response.json() as Array<SongInfo>;
    this.setState(state => ({ list: json }));
  }

  handleClick(song: string) {
    this.props.history.push(`/songview?s=${song}`);
  }

  render() {
    const { classes } = this.props;
    return (
      <React.Fragment>
        <Typography variant="h1" className={classes.title}>
          この音楽プレーヤーについて
        </Typography>
        <Typography mt={2} mb={2}>この音楽プレーヤーは、これまでにない新しい音楽鑑賞システムのプロトタイプとして開発されたものです。複数人が歌う楽曲を分析・合成し、本来とは異なる歌い分けで音楽を鑑賞することができます。プロトタイプのため楽曲は童謡の「かたつむり」を用いていますが、将来的にはアニメやアイドルの楽曲に拡張する予定です。</Typography>
        <Typography variant="h1" className={classes.title}>
          使い方
        </Typography>
        <img src="instruction.png" width="100%" />
        <Typography variant="h1" className={classes.title}>
          List of Songs
        </Typography>
        <Typography mt={2}>（VCあり）と記載されているものは、歌い分けされている音源を利用して、声質変換技術によって生成したものです。</Typography>
        <TableContainer className={classes.tableContainer} component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Song</TableCell>
                <TableCell>Artist</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {this.state.list.map((row) => (
                <TableRow hover key={row.slug} onClick={this.handleClick.bind(this, row.slug)} className={classes.songRow}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.artist}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </React.Fragment>
    );
  }
}

export default withStyles(styles)(SongList);

import React from 'react';
import { DefaultTheme, withStyles, WithStyles } from '@material-ui/styles';
import { AppBar, Container, Toolbar, Typography } from '@material-ui/core';
import { Link } from "react-router-dom";

const styles = (theme: DefaultTheme) => ({
  title: {
    textDecoration: 'none',
    color: 'white'
  },
  container: {
    paddingTop: '20px'
  }
});

interface Props extends WithStyles<typeof styles> {
}

class AppBase extends React.Component<Props> {
  render() {
    const { classes, children } = this.props;
    return (
      <React.Fragment>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6">
              <Link to="/" className={classes.title}>VocalRemixer</Link>
            </Typography>
          </Toolbar>
        </AppBar>
        <Container className={classes.container}>
          {children}
        </Container>
      </React.Fragment>
    );
  }
}

export default withStyles(styles)(AppBase);

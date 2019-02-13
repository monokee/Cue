Cue.UI('Todo-Container', Component => ({

  template: (
    `<div class="container">
        <h1 class="headline"></h1>
        <div class="editorContainer"></div>
        <div class="footer">
          <p>Double-click to edit a todo</p>
          <p>Written by monokee</p>
          <p>Not part of TodoMVC</p>
        </div>
     </div>`
  ),

  styles: {

    container: {
      position       : 'relative',
      width          : '100vw',
      height         : '100vh',
      overflow       : 'hidden',
      display        : 'flex',
      flexDirection  : 'column',
      alignItems     : 'center',
      justifyContent : 'center',
      fontFamily     : 'Roboto, sans-serif',
      color          : 'rgb(232,235,238)',
      backgroundColor: 'rgb(22,25,28)',
      userSelect: 'none'
    },

    title: {
      margin   : '1em 0',
      color    : 'rgb(0,115,255)',
      fontSize : '3.5em',
      textAlign: 'center'
    },

    editorContainer: {
      width        : '650px',
      maxWidth     : '95%',
      boxShadow    : 'none'
    },

    footer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '2.5em',

      p: {
        margin: 0
      }

    }

  },

  imports: {
    Editor: Component.import('Todo-Editor')
  },

  initialize(state) {
    this.state = state;
    this.headline = this.select('.headline');
    this.editorContainer = this.select('.editorContainer');
  },

  renderState: {

    title(text) {
      this.headline.textContent = text;
    },

    editor(data) {
      this.editorContainer.appendChild(
        this.imports.Editor(data)
      );
    }

  }

}));
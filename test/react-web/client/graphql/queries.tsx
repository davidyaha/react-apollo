
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as chai from 'chai';
import { mount } from 'enzyme';
import gql from 'graphql-tag';

import ApolloClient from 'apollo-client';
import { ApolloError } from 'apollo-client/errors';

declare function require(name: string);
import chaiEnzyme = require('chai-enzyme');

chai.use(chaiEnzyme()); // Note the invocation at the end
const { expect } = chai;

import mockNetworkInterface from '../../../mocks/mockNetworkInterface';
import {
  // Passthrough,
  ProviderMock,
} from '../../../mocks/components';

import graphql from '../../../../src/graphql';

describe('queries', () => {

  it('binds a query to props', () => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    const ContainerWithData =  graphql(query)(({ data }) => { // tslint:disable-line
      expect(data).to.exist;
      expect(data.ownProps).to.not.exist;
      expect(data.loading).to.be.true;
      return null;
    });

    const wrapper = mount(<ProviderMock client={client}><ContainerWithData /></ProviderMock>);
    (wrapper as any).unmount();
  });

  it('includes the variables in the props', () => {
    const query = gql`query people ($first: Int) { allPeople(first: $first) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables = { first: 1 };
    const networkInterface = mockNetworkInterface(
      { request: { query, variables }, result: { data } }
    );
    const client = new ApolloClient({ networkInterface });

    const ContainerWithData =  graphql(query)(({ data }) => { // tslint:disable-line
      expect(data).to.exist;
      expect(data.variables).to.deep.equal(variables);
      return null;
    });

    mount(<ProviderMock client={client}><ContainerWithData first={1} /></ProviderMock>);
  });

  it('does not swallow children errors', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });
    let bar;
    const ContainerWithData =  graphql(query)(() => {
      bar(); // this will throw
      return null;
    });

    try {
      mount(<ProviderMock client={client}><ContainerWithData /></ProviderMock>);
      done(new Error('component should have thrown'));
    } catch (e) {
      expect(e).to.match(/TypeError/);
      done();
    }

  });

  it('executes a query', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.data.loading).to.be.false;
        expect(props.data.allPeople).to.deep.equal(data.allPeople);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('correctly rebuilds props on remount', (done) => {
    const query = gql`query pollingPeople { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Darth Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data }, newData: () => ({
        data: {
          allPeople: { people: [ { name: `Darth Skywalker - ${Math.random()}` } ] },
        }
      }) }
    );
    const client = new ApolloClient({ networkInterface });
    let wrapper, app, count = 0;

    @graphql(query, { options: { pollInterval: 10 }})
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        if (count === 1) { // has data
          wrapper.unmount();
          wrapper = mount(app);
        }

        if (count === 10) {
          wrapper.unmount();
          done();
        }
        count++;
      }
      render() {
        return null;
      }
    };

    app = <ProviderMock client={client}><Container /></ProviderMock>;

    wrapper = mount(app);
  });

  it('correctly sets loading state on remounted forcefetch', (done) => {
    const query = gql`query pollingPeople { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Darth Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data }, delay: 10, newData: () => ({
        data: {
          allPeople: { people: [ { name: `Darth Skywalker - ${Math.random()}` } ] },
        },
      }) }
    );
    const client = new ApolloClient({ networkInterface });
    let wrapper, app, count = 0;

    @graphql(query, { options: { forceFetch: true }})
    class Container extends React.Component<any, any> {
      componentWillMount() {
        if (count === 1) {
          expect(this.props.data.loading).to.be.true; // on remount
          count++;
        }
      }
      componentWillReceiveProps(props) {
        if (count === 0) { // has data
          wrapper.unmount();
          setTimeout(() => {
            wrapper = mount(app);
          }, 5);
        }

        if (count === 2) {
          // remounted data after fetch
          expect(props.data.loading).to.be.false;
          expect(props.data.allPeople).to.exist;
          done();
        }
        count++;
      }
      render() {
        return null;
      }
    };

    app = <ProviderMock client={client}><Container /></ProviderMock>;

    wrapper = mount(app);
  });

  it('correctly sets loading state on remounted component with changed variables', (done) => {
    const query = gql`
      query remount($first: Int) { allPeople(first: $first) { people { name } } }
    `;
    const data = { allPeople: null };
    const variables = { first: 1 };
    const variables2 = { first: 2 };
    const networkInterface = mockNetworkInterface(
      { request: { query, variables }, result: { data }, delay: 10 },
      { request: { query, variables: variables2 }, result: { data }, delay: 10 }
    );
    const client = new ApolloClient({ networkInterface });
    let wrapper, render, count = 0;

    @graphql(query, { options: ({ first }) => ({ variables: { first }})})
    class Container extends React.Component<any, any> {
      componentWillMount() {
        if (count === 1) {
          expect(this.props.data.loading).to.be.true; // on remount
          count++;
        }
      }
      componentWillReceiveProps(props) {
        if (count === 0) { // has data
          wrapper.unmount();
          setTimeout(() => {
            wrapper = mount(render(2));
          }, 5);
        }

        if (count === 2) {
          // remounted data after fetch
          expect(props.data.loading).to.be.false;
          done();
        }
        count++;
      }
      render() {
        return null;
      }
    };

    render = (first) => (
      <ProviderMock client={client}><Container first={first} /></ProviderMock>
    );

    wrapper = mount(render(1));
  });

  it('correctly sets loading state on remounted component with changed variables (alt)', (done) => {
    const query = gql`
      query remount($name: String) { allPeople(name: $name) { people { name } } }
    `;
    const data = { allPeople: null };
    const variables = { name: 'does-not-exist' };
    const variables2 = { name: 'nothing-either' };
    const networkInterface = mockNetworkInterface(
      { request: { query, variables }, result: { data }, delay: 10 },
      { request: { query, variables: variables2 }, result: { data }, delay: 10 }
    );
    const client = new ApolloClient({ networkInterface });
    let count = 0;

    @graphql(query)
    class Container extends React.Component<any, any> {
      render() {
        const { loading } = this.props.data;
        if (count === 0) expect(loading).to.be.true;
        if (count === 1) expect(loading).to.be.false;
        if (count === 2) expect(loading).to.be.true;
        if (count === 3) {
          expect(loading).to.be.false;
          done();
        }
        count ++;
        return null;
      }
    };
    const main = document.createElement('DIV');
    main.id = 'main';
    document.body.appendChild(main);

    const render = (props) => {
      ReactDOM.render((
        <ProviderMock client={client}>
          <Container {...props} />
        </ProviderMock>
      ), document.getElementById('main'));
    };

    // Initial render.
    render(variables);

    // Prop update: fetch.
    setTimeout(() => render(variables2), 1000);
  });

  it('correctly sets loading state on component with changed variables and unchanged result', (done) => {
     const query = gql`
       query remount($first: Int) { allPeople(first: $first) { people { name } } }
     `;
     const data = { allPeople: null };
     const variables = { first: 1 };
     const variables2 = { first: 2 };
     const networkInterface = mockNetworkInterface(
       { request: { query, variables }, result: { data }, delay: 10 },
       { request: { query, variables: variables2 }, result: { data }, delay: 10 }
     );
     const client = new ApolloClient({ networkInterface });
     let count = 0;

     const connect = (component) : any => {
       return class Container extends React.Component<any, any> {
         constructor(props) {
           super(props);

           this.state = {
             first: 1,
           };
           this.setFirst = this.setFirst.bind(this);
         }

         setFirst(first) {
           this.setState({first});
         }

         render() {
           return React.createElement(component, {
             first: this.state.first,
             setFirst: this.setFirst
           });
         }
       }
     }

     @connect
     @graphql(query, { options: ({ first }) => ({ variables: { first }})})
     class Container extends React.Component<any, any> {
       componentWillReceiveProps(props) {
         if (count === 0) { // has data
           setTimeout(() => {
             this.props.setFirst(2);
           }, 5);
         }

         if (count === 1) {
           expect(this.props.data.loading).to.be.true; // on variables change
         }

         if (count === 2) {
           // new data after fetch
           expect(props.data.loading).to.be.false;
           done();
         }
         count++;
       }
       render() {
         return null;
       }
     };

     mount(<ProviderMock client={client}><Container /></ProviderMock>);
   });

  it('executes a query with two root fields', (done) => {
    const query = gql`query people {
      allPeople(first: 1) { people { name } }
      otherPeople(first: 1) { people { name } }
    }`;
    const data = {
      allPeople: { people: [ { name: 'Luke Skywalker' } ] },
      otherPeople: { people: [ { name: 'Luke Skywalker' } ] },
    };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.data.loading).to.be.false;
        expect(props.data.allPeople).to.deep.equal(data.allPeople);
        expect(props.data.otherPeople).to.deep.equal(data.otherPeople);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('can unmount without error', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    const ContainerWithData =  graphql(query)(() => null);

    const wrapper = mount(
      <ProviderMock client={client}><ContainerWithData /></ProviderMock>
    ) as any;

    try {
      wrapper.unmount();
      done();
    } catch (e) { done(e); }
  });

  it('passes any GraphQL errors in props', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const networkInterface = mockNetworkInterface({ request: { query }, error: new Error('boo') });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class ErrorContainer extends React.Component<any, any> {
      componentWillReceiveProps({ data }) { // tslint:disable-line
        expect(data.error).to.exist;
        expect(data.error).instanceof(ApolloError);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><ErrorContainer /></ProviderMock>);
  });

  it('maps props as variables if they match', (done) => {
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables = { first: 1 };
    const networkInterface = mockNetworkInterface({
      request: { query, variables },
      result: { data },
    });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.data.loading).to.be.false;
        expect(props.data.allPeople).to.deep.equal(data.allPeople);
        expect(props.data.variables).to.deep.equal(this.props.data.variables);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container first={1} /></ProviderMock>);
  });

  it('allows falsy values in the mapped variables from props', (done) => {
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables = { first: null };
    const networkInterface = mockNetworkInterface({
      request: { query, variables },
      result: { data },
    });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.data.loading).to.be.false;
        expect(props.data.allPeople).to.deep.equal(data.allPeople);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container first={null} /></ProviderMock>);
  });

  it('don\'t error on optional required props', () => {
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables = { first: 1 };
    const networkInterface = mockNetworkInterface({
      request: { query, variables },
      result: { data },
    });
    const client = new ApolloClient({ networkInterface });
    const Container =  graphql(query)(() => null);

    let error = null;
    try {
      mount(<ProviderMock client={client}><Container frst={1} /></ProviderMock>);
    } catch (e) { error = e; }

    expect(error).to.be.null;

  });

  it('errors if the passed props don\'t contain the needed variables', () => {
    const query = gql`
      query people($first: Int!) {
        allPeople(first: $first) { people { name } }
      }
    `;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables = { first: 1 };
    const networkInterface = mockNetworkInterface({
      request: { query, variables },
      result: { data },
    });
    const client = new ApolloClient({ networkInterface });
    const Container =  graphql(query)(() => null);

    try {
      mount(<ProviderMock client={client}><Container frst={1} /></ProviderMock>);
    } catch (e) {
      expect(e).to.match(/Invariant Violation: The operation 'people'/);
    }

  });

  it('rebuilds the queries on prop change when using `options`', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });


    let firstRun = true;
    let isDone = false;
    function options(props) {
      if (!firstRun) {
        expect(props.listId).to.equal(2);
        if (!isDone) done();
        isDone = true;
      }
      return {};
    };

    const Container = graphql(query, { options })((props) => null);

    class ChangingProps extends React.Component<any, any> {
      state = { listId: 1 };

      componentDidMount() {
        setTimeout(() => {
          firstRun = false;
          this.setState({ listId: 2 });
        }, 50);
      }

      render() {
        return <Container listId={this.state.listId} />;
      }
    }

    mount(<ProviderMock client={client}><ChangingProps /></ProviderMock>);
  });

  it('allows you to skip a query', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    let queryExecuted;
    @graphql(query, { options: () => ({ skip: true }) })
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        queryExecuted = true;
      }
      render() {
        expect(this.props.data.loading).to.be.false;
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);

    setTimeout(() => {
      if (!queryExecuted) { done(); return; }
      done(new Error('query ran even though skip present'));
    }, 25);
  });

  it('reruns the query if it changes', (done) => {
    let count = 0;
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;

    const data1 = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables1 = { first: 1 };

    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const variables2 = { first: 2 };

    const networkInterface = mockNetworkInterface(
      { request: { query, variables: variables1 }, result: { data: data1 } },
      { request: { query, variables: variables2 }, result: { data: data2 } }
    );

    const client = new ApolloClient({ networkInterface });

    @graphql(query, {
      options: (props) => ({ variables: props, returnPartialData: count === 0 }),
    })
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) {
        // loading is true, but data still there
        if (count === 1 && data.loading) {
          expect(data.allPeople).to.deep.equal(data1.allPeople);
        }
        if (count === 1 && !data.loading && this.props.data.loading) {
          expect(data.allPeople).to.deep.equal(data2.allPeople);
          done();
        }
      }
      render() {
        return null;
      }
    };

    class ChangingProps extends React.Component<any, any> {
      state = { first: 1 };

      componentDidMount() {
        setTimeout(() => {
          count++;
          this.setState({ first: 2 });
        }, 50);
      }

      render() {
        return <Container first={this.state.first} />;
      }
    }

    mount(<ProviderMock client={client}><ChangingProps /></ProviderMock>);
  });

  it('reruns the query if just the variables change', (done) => {
    let count = 0;
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;

    const data1 = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables1 = { first: 1 };

    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const variables2 = { first: 2 };

    const networkInterface = mockNetworkInterface(
      { request: { query, variables: variables1 }, result: { data: data1 } },
      { request: { query, variables: variables2 }, result: { data: data2 } }
    );

    const client = new ApolloClient({ networkInterface });

    @graphql(query, { options: (props) => ({ variables: props }) })
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) {
        // loading is true, but data still there
        if (count === 1 && data.loading) {
          expect(data.allPeople).to.deep.equal(data1.allPeople);
        }
        if (count === 1 && !data.loading && this.props.data.loading) {
          expect(data.allPeople).to.deep.equal(data2.allPeople);
          done();
        }
      }
      render() {
        return null;
      }
    };

    class ChangingProps extends React.Component<any, any> {
      state = { first: 1 };

      componentDidMount() {
        setTimeout(() => {
          count++;
          this.setState({ first: 2 });
        }, 50);
      }

      render() {
        return <Container first={this.state.first} />;
      }
    }

    mount(<ProviderMock client={client}><ChangingProps /></ProviderMock>);
  });

  it('reruns the queries on prop change when using passed props', (done) => {
    let count = 0;
    const query = gql`
      query people($first: Int) {
        allPeople(first: $first) { people { name } }
      }
    `;

    const data1 = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const variables1 = { first: 1 };

    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const variables2 = { first: 2 };

    const networkInterface = mockNetworkInterface(
      { request: { query, variables: variables1 }, result: { data: data1 } },
      { request: { query, variables: variables2 }, result: { data: data2 } }
    );

    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) {
        // loading is true, but data still there
        if (count === 1 && data.loading) {
          expect(data.allPeople).to.deep.equal(data1.allPeople);
        }
        if (count === 1 && !data.loading && this.props.data.loading) {
          expect(data.allPeople).to.deep.equal(data2.allPeople);
          done();
        }
      }
      render() {
        return null;
      }
    };

    class ChangingProps extends React.Component<any, any> {
      state = { first: 1 };

      componentDidMount() {
        setTimeout(() => {
          count++;
          this.setState({ first: 2 });
        }, 50);
      }

      render() {
        return <Container first={this.state.first} />;
      }
    }

    mount(<ProviderMock client={client}><ChangingProps /></ProviderMock>);
  });

  it('exposes refetch as part of the props api', (done) => {
    const query = gql`query people($first: Int) { allPeople(first: $first) { people { name } } }`;
    const variables = { first: 1 };
    const data1 = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query, variables }, result: { data: data1 } },
      { request: { query, variables }, result: { data: data1 } },
      { request: { query, variables: { first: 2 } }, result: { data: data1 } }
    );
    const client = new ApolloClient({ networkInterface });

    let hasRefetched, count = 0;
    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillMount(){
        expect(this.props.data.refetch).to.be.exist;
        expect(this.props.data.refetch).to.be.instanceof(Function);
      }
      componentWillReceiveProps({ data }) { // tslint:disable-line
        if (count === 0) expect(data.loading).to.be.false; // first data
        if (count === 1) expect(data.loading).to.be.true; // first refetch
        if (count === 2) expect(data.loading).to.be.false; // second data
        if (count === 3) expect(data.loading).to.be.true; // second refetch
        if (count === 4) expect(data.loading).to.be.false; // third data
        count ++;
        if (hasRefetched) return;
        hasRefetched = true;
        expect(data.refetch).to.be.exist;
        expect(data.refetch).to.be.instanceof(Function);
        data.refetch()
          .then(result => {
            expect(result.data).to.deep.equal(data1);
            data.refetch({ first: 2 }) // new variables
              .then(response => {
                expect(response.data).to.deep.equal(data1);
                expect(data.allPeople).to.deep.equal(data1.allPeople);
                done();
              });
          })
          .catch(done);
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container first={1} /></ProviderMock>);
  });

  it('exposes fetchMore as part of the props api', (done) => {
    const query = gql`
      query people($skip: Int, $first: Int) { allPeople(first: $first, skip: $skip) { people { name } } }
    `;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const data1 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const variables = { skip: 1, first: 1 };
    const variables2 = { skip: 2, first: 1 };

    const networkInterface = mockNetworkInterface(
      { request: { query, variables }, result: { data } },
      { request: { query, variables: variables2 }, result: { data: data1 } }
    );
    const client = new ApolloClient({ networkInterface });

    let count = 0;
    @graphql(query, { options: () => ({ variables }) })
    class Container extends React.Component<any, any> {
      componentWillMount(){
        expect(this.props.data.fetchMore).to.be.exist;
        expect(this.props.data.fetchMore).to.be.instanceof(Function);
      }
      componentWillReceiveProps(props) {
        if (count === 0) {
          expect(props.data.fetchMore).to.be.exist;
          expect(props.data.fetchMore).to.be.instanceof(Function);
          props.data.fetchMore({
            variables: { skip: 2 },
            updateQuery: (prev, { fetchMoreResult }) => ({
              allPeople: {
                people: prev.allPeople.people.concat(fetchMoreResult.data.allPeople.people),
              },
            }),
          });
          // XXX add a test for the result here when #508 is merged and released
        } else if (count === 1) {
          expect(props.data.variables).to.deep.equal(variables2);
          expect(props.data.loading).to.be.true;
          expect(props.data.allPeople).to.deep.equal(data.allPeople);
        } else if (count === 2) {
          expect(props.data.variables).to.deep.equal(variables2);
          expect(props.data.loading).to.be.false;
          expect(props.data.allPeople.people).to.deep.equal(
            data.allPeople.people.concat(data1.allPeople.people)
          );
          done();
        } else {
          done(new Error('should not reach this point'));
        }
        count++;
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('exposes stopPolling as part of the props api', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) { // tslint:disable-line
        expect(data.stopPolling).to.be.exist;
        expect(data.stopPolling).to.be.instanceof(Function);
        expect(data.stopPolling).to.not.throw;
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('exposes startPolling as part of the props api', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) { // tslint:disable-line
        expect(data.startPolling).to.be.exist;
        expect(data.startPolling).to.be.instanceof(Function);
        expect(data.startPolling).to.not.throw;
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });


  it('resets the loading state after a refetched query', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data } },
      { request: { query }, result: { data: data2 } }
    );
    const client = new ApolloClient({ networkInterface });

    let isRefectching;
    let refetched;
    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        // get new data with no more loading state
        if (refetched) {
          expect(props.data.loading).to.be.false;
          expect(props.data.allPeople).to.deep.equal(data2.allPeople);
          done();
          return;
        }

        // don't remove old data
        if (isRefectching) {
          isRefectching = false;
          refetched = true;
          expect(props.data.loading).to.be.true;
          expect(props.data.allPeople).to.deep.equal(data.allPeople);
          return;
        }

        if (!isRefectching) {
          isRefectching = true;
          props.data.refetch();
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });
  it('resets the loading state after a refetched query even if the data doesn\'t change', (d) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data } },
      { request: { query }, result: { data } }
    );
    const client = new ApolloClient({ networkInterface });

    let isRefectching;
    let refetched;
    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        // get new data with no more loading state
        if (refetched) {
          expect(props.data.loading).to.be.false;
          expect(props.data.allPeople).to.deep.equal(data.allPeople);
          d();
          return;
        }

        // don't remove old data
        if (isRefectching) {
          isRefectching = false;
          refetched = true;
          expect(props.data.loading).to.be.true;
          expect(props.data.allPeople).to.deep.equal(data.allPeople);
          return;
        }

        if (!isRefectching) {
          isRefectching = true;
          props.data.refetch();
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('allows a polling query to be created', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data } },
      { request: { query }, result: { data: data2 } },
      { request: { query }, result: { data: data2 } }
    );
    const client = new ApolloClient({ networkInterface });

    let count = 0;
    const Container = graphql(query, { options: () => ({ pollInterval: 75 }) })(() => {
      count++;
      return null;
    });

    const wrapper = mount(<ProviderMock client={client}><Container /></ProviderMock>);

    setTimeout(() => {
      expect(count).to.equal(3);
      (wrapper as any).unmount();
      done();
    }, 160);
  });

  it('allows custom mapping of a result to props', () => {
    const query = gql`query thing { getThing { thing } }`;
    const data = { getThing: { thing: true } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    const props = ({ data }) => ({ showSpinner: data.loading });
    const ContainerWithData = graphql(query, { props })(({ showSpinner }) => {
      expect(showSpinner).to.be.true;
      return null;
    });

    const wrapper = mount(<ProviderMock client={client}><ContainerWithData /></ProviderMock>);
    (wrapper as any).unmount();
  });

  it('allows custom mapping of a result to props that includes the passed props', () => {
    const query = gql`query thing { getThing { thing } }`;
    const data = { getThing: { thing: true } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    const props = ({ data, ownProps }) => {
      expect(ownProps.sample).to.equal(1);
      return { showSpinner: data.loading };
    };
    const ContainerWithData = graphql(query, { props })(({ showSpinner }) => {
      expect(showSpinner).to.be.true;
      return null;
    });

    const wrapper = mount(
      <ProviderMock client={client}><ContainerWithData sample={1} /></ProviderMock>
    );
    (wrapper as any).unmount();
  });

  it('allows custom mapping of a result to props', (done) => {
    const query = gql`query thing { getThing { thing } }`;
    const data = { getThing: { thing: true } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query, { props: ({ data }) => ({ thingy: data.getThing }) }) // tslint:disable-line
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.thingy).to.deep.equal(data.getThing);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('allows context through updates', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        expect(props.data.loading).to.be.false;
        expect(props.data.allPeople).to.deep.equal(data.allPeople);
      }
      render() {
        return <div>{this.props.children}</div>;
      }
    };

    class ContextContainer extends React.Component<any, any> {

      constructor(props) {
        super(props);
        this.state = { color: 'purple' };
      }

      getChildContext() {
        return { color: this.state.color };
      }

      componentDidMount() {
        setTimeout(() => {
          this.setState({ color: 'green' });
        }, 50);
      }

      render() {
        return <div>{this.props.children}</div>;
      }
    }

    (ContextContainer as any).childContextTypes = {
      color: React.PropTypes.string,
    };

    let count = 0;
    class ChildContextContainer extends React.Component<any, any> {
      render() {
        const { color } = (this.context as any);
        if (count === 0) expect(color).to.eq('purple');
        if (count === 1) {
          expect(color).to.eq('green');
          done();
        }

        count++;
        return <div>{this.props.children}</div>;
      }
    }

    (ChildContextContainer as any).contextTypes = {
      color: React.PropTypes.string,
    };

    mount(
      <ProviderMock client={client}>
        <ContextContainer>
          <Container>
            <ChildContextContainer />
          </Container>
        </ContextContainer>
      </ProviderMock>);
  });

  it('exposes updateQuery as part of the props api', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps({ data }) { // tslint:disable-line
        expect(data.updateQuery).to.be.exist;
        expect(data.updateQuery).to.be.instanceof(Function);
        expect(data.updateQuery).to.not.throw;
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('exposes updateQuery as part of the props api during componentWillMount', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillMount() { // tslint:disable-line
        expect(this.props.data.updateQuery).to.be.exist;
        expect(this.props.data.updateQuery).to.be.instanceof(Function);
        done();
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('updateQuery throws if called before data has returned', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const networkInterface = mockNetworkInterface({ request: { query }, result: { data } });
    const client = new ApolloClient({ networkInterface });

    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillMount() { // tslint:disable-line
        expect(this.props.data.updateQuery).to.be.exist;
        expect(this.props.data.updateQuery).to.be.instanceof(Function);
        try {
          this.props.data.updateQuery();
          done(new Error('should have thrown'))
        } catch (e) {
          expect(e).to.match(/Invariant Violation:/);
          done();
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('allows updating query results after query has finished (early binding)', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data } },
      { request: { query }, result: { data: data2 } }
    );
    const client = new ApolloClient({ networkInterface });

    let isUpdated;
    @graphql(query)
    class Container extends React.Component<any, any> {
      public updateQuery: any;
      componentWillMount() {
        this.updateQuery = this.props.data.updateQuery;
      }
      componentWillReceiveProps(props) {
        if (isUpdated) {
          expect(props.data.allPeople).to.deep.equal(data2.allPeople);
          done();
          return;
        } else {
          isUpdated = true;
          this.updateQuery((prev) => {
            return data2;
          });
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('allows updating query results after query has finished', (done) => {
    const query = gql`query people { allPeople(first: 1) { people { name } } }`;
    const data = { allPeople: { people: [ { name: 'Luke Skywalker' } ] } };
    const data2 = { allPeople: { people: [ { name: 'Leia Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query }, result: { data } },
      { request: { query }, result: { data: data2 } }
    );
    const client = new ApolloClient({ networkInterface });

    let isUpdated;
    @graphql(query)
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        if (isUpdated) {
          expect(props.data.allPeople).to.deep.equal(data2.allPeople);
          done();
          return;
        } else {
          isUpdated = true;
          props.data.updateQuery((prev) => {
            return data2;
          });
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });

  it('reruns props function after query results change via fetchMore', (done) => {
    const query = gql`query people($cursor: Int) {
      allPeople(cursor: $cursor) { cursor, people { name } }
    }`;
    const vars1 = { cursor: null };
    const data1 = { allPeople: { cursor: 1, people: [ { name: 'Luke Skywalker' } ] } };
    const vars2 = { cursor: 1 };
    const data2 = { allPeople: { cursor: 2, people: [ { name: 'Leia Skywalker' } ] } };
    const networkInterface = mockNetworkInterface(
      { request: { query, variables: vars1 }, result: { data: data1 } },
      { request: { query, variables: vars2 }, result: { data: data2 } }
    );
    const client = new ApolloClient({ networkInterface });

    let isUpdated = false;
    @graphql(query, {
      // XXX: I think we should be able to avoid this https://github.com/apollostack/react-apollo/issues/197
      options: { variables: { cursor: null } },
      props({ data: { loading, allPeople, fetchMore } }) {
        if (loading) return { loading };

        const { cursor, people } = allPeople;
        return {
          people,
          getMorePeople: () => fetchMore({
            variables: { cursor },
            updateQuery(prev, { fetchMoreResult }) {
              const { data: { allPeople: { cursor, people } } } = fetchMoreResult;
              return {
                allPeople: {
                  cursor,
                  people: [...people, ...prev.allPeople.people],
                },
              };
            }
          }),
        }
      }
    })
    class Container extends React.Component<any, any> {
      componentWillReceiveProps(props) {
        if (props.loading) {
          return;
        } else if (isUpdated) {
          expect(props.people.length).to.equal(2);
          done();
          return;
        } else {
          isUpdated = true;
          expect(props.people).to.deep.equal(data1.allPeople.people);
          props.getMorePeople();
        }
      }
      render() {
        return null;
      }
    };

    mount(<ProviderMock client={client}><Container /></ProviderMock>);
  });
});

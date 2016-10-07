import { Server } from 'base-rest-service-container/build/Server';
import { IRoute } from 'base-rest-service-container/build/Route/IRoute';
import {ApplicationConfig} from 'base-rest-service-container/build/Config/ApplicationConfig';
import { UserRepository } from '../Model/UserRepository';
import * as mongoose from 'mongoose';
import { UsersApi } from '../RouteController/UsersApi';

let config:ApplicationConfig = new ApplicationConfig();
let server:Server = Server.Bootstrap(config);
let userRepository = new UserRepository();

let api:IRoute = new UsersApi(userRepository, '/users');

server.AddRoute(api);

// connects to db before defining UserSchema
mongoose.connect(config.GetDatabaseConnectionString())
    .then(
        () => {
            console.log(`Database: ${config.GetDatabaseConnectionString()}`);
            console.log('DB connection  succeeded');

            server.Start();

            console.log('Server started');
        }, 
        (err:any) => console.error(err));



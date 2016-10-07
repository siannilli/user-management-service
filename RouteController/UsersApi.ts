'use strict';
import * as express from 'express';
import { Server } from 'base-rest-service-container/build/Server';
import * as url from 'url';
import * as pathUtils from 'path';

import { IRoute } from 'base-rest-service-container/build/Route/IRoute'
import * as Repository from '../Model/UserRepository';
import { RepositoryQueryCommand } from 'base-mongodb-repository/build/RepositoryQuery';
import { RepositoryQueryResult } from 'base-mongodb-repository/build/RepositoryQueryResult';
import * as Errors from 'base-rest-service-container/build/Common/Exceptions';
import { TokenManagement, TokenPayload, IAuthenticatedRequest } from 'base-rest-service-container/build/Common/SecurityService';
import {ApplicationConfig} from 'base-rest-service-container/build/Config/ApplicationConfig';
import { ShippingApplications, ShippingRoles } from '../Model/AppAndPermissions';

interface IUserRequest extends IAuthenticatedRequest {
    ActionUser: Repository.IUserModel;
    CallerUser: Repository.IUserModel;
}

/**
 * User
 */
export class UsersApi implements IRoute {
    private app: express.Application = null;
    private serverContainer: Server;
    private repository: Repository.UserRepository = new Repository.UserRepository();
    private tokenService: TokenManagement;
    constructor(public path: string = '/api/users') {

    }

    public setup(server: Server) {
        this.serverContainer = server;
        this.tokenService = new TokenManagement(this.serverContainer.config)
        this.app = server.GetServerInstance();
        this.app.use(this.path, this.setupRouter());
    }

    private setupRouter(): express.Router {
        let router = express.Router();

        router.post('/authenticate', this.ReleaseAuthenticationToken);

        if (this.serverContainer.config.MustAuthenticateRequest()) {
            router.use(TokenManagement.SecurityCheck);
        }

        // setups middlewares 
        router.use('/current', this.SetCallingUser);

        // tools for current users 
        router.get('/current', this.GetCurrent);
        router.get('/current/apps', this.GetUserApplications);
        router.get('/current/roles', this.GetUserRoles);
        router.patch('/current/changepassword', this.ChangePassword);
        router.patch('/current/changeemailaddress', this.ChangeEmailAddress);

        router
            .get('/', this.Find)
            .post('/', this.Add);

        // tobe moved to other apis
        router.get('/getroles', this.GetRoles);
        router.get('/getapplications', this.GetApplications);

        // admin methods
        router.use('/user/:id', this.GetUserById); // middleware        
        router
            .get('/user/:id', this.Get)
            .delete('/user/:id', this.Delete)
            .patch('/user/:id', this.Update)
            .patch('/user/:id/resetpassword', this.ResetUserPassword);

        router
            .get('/user/:id/roles', this.GetUserRoles)
            .post('/user/:id/roles', this.ChangeUserRoles);

        router
            .get('/user/:id/apps', this.GetUserApplications)
            .post('/user/:id/apps', this.ChangeUserApplications);



        return router;
    }

    //middleware functions 
    private GetUserById = (request: IUserRequest, response: express.Response, next: express.NextFunction) => {

        this.repository.Get(request.params.id)
            .then(data => {
                if (data) {
                    request.ActionUser = data;
                    next();
                }
                else
                    Errors.SendError(new Errors.EntitytNotFoundError(), response);
            })
            .catch(err => Errors.SendError(err, response));
    }

    private SetCallingUser = (request: IUserRequest, response: express.Response, next: express.NextFunction) => {
        let token: TokenPayload = request.token;

        this.repository.GetByUsername(token.login)
            .then(user => {
                if (user) {
                    request.CallerUser = user;
                    next();
                }
                else
                    Errors.SendError(new Errors.EntitytNotFoundError(), response);
            })
            .catch(error => Errors.SendError(error, response));
    }

    private Find = (request: express.Request, response: express.Response) => {
        try {
            let searchQuery = RepositoryQueryCommand.ParseRequest(request.query);
            searchQuery.sort = "username";

            this.repository.Find(searchQuery)
                .then(data => response.json(data))
                .catch(err => Errors.SendError(err, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }
    }

    // api methods
    private Get = (request: IUserRequest, response: express.Response) => {

        response.json(request.ActionUser)
    }

    private GetCurrent = (request: IUserRequest, response: express.Response) => {

        if (request.CallerUser)
            response.json(request.CallerUser);
        else
            Errors.SendError(new Errors.EntitytNotFoundError(), response);
    }

    private Add = (request: express.Request, response: express.Response) => {

        try {
            let command: Repository.AddUserCommand = new Repository.AddUserCommand(request.body.username, request.body.password, request.body.password_confirm, request.body.email);

            this.repository.Add(command)
                .then(doc => {
                    response.header('Location', pathUtils.join(request.baseUrl, doc._id.toString()));
                    response.sendStatus(201);
                })
                .catch(err => Errors.SendError(err, response));

        } catch (error) {
            Errors.SendError(error, response)
        }
    }

    private Update = (request: IUserRequest, response: express.Response) => {
        // clean invalid properties like password and object id from the request body object
        delete request.body._id;
        delete request.body.password;

        for (let p in request.body) {
            request.ActionUser[p] = request.body[p];
        }
        try {
            let UpdateCommand = new Repository.UpdateUserCommand(request.ActionUser);
            this.repository.Save(UpdateCommand)
                .then((user: Repository.IUserModel) => response.json(user))
                .catch(err => {
                    Errors.SendError(err, response);
                });
        }
        catch (err) {
            Errors.SendError(err, response);
        }

    }

    private ChangeEmailAddress = (request: IUserRequest, response: express.Response) => {
        try {
            let command = new Repository.ChangeEmailAddressCommand(request.CallerUser, request.body.email_address);
            this.repository.HandleChangeEmailAddress(command)
                .then(user => response.status(200).json(user))
                .catch(err => Errors.SendError(err, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }

    }


    private ChangeUserRoles = (request: IUserRequest, response: express.Response) => {
        try {
            let command = new Repository.ChangeUserRolesCommand(request.ActionUser, request.body.roles);

            this.repository.Save(command)
                .then(doc => response.status(200).json(doc))
                .catch(error => Errors.SendError(error, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }
    }

    private ChangeUserApplications = (request: IUserRequest, response: express.Response) => {
        try {
            let command = new Repository.ChangeUserApplicationsCommand(request.ActionUser, request.body.applications);
            this.repository.Save(command)
                .then(doc => response.status(200).json(doc))
                .catch(error => Errors.SendError(error, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }
    }

    private ChangePassword = (request: IUserRequest, response: express.Response) => {

        try {
            let command = new Repository.ChangePasswordCommand(request.CallerUser, request.body.oldpassword, request.body.password, request.body.password_confirm);
            this.repository.HandleChangePassword(command)
                .then(user => response.sendStatus(200))
                .catch(err => Errors.SendError(err, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }
    }

    private ResetUserPassword = (request: IUserRequest, response: express.Response) => {
        try {
            let command = new Repository.ResetPassword(request.ActionUser, request.body.password, request.body.password_confirm);
            this.repository.Save(command)
                .then(user => response.sendStatus(200))
                .catch(error => Errors.SendError(error, response));
        }
        catch (err) {
            Errors.SendError(err, response);
        }

    }

    private Delete = (request: IUserRequest, response: express.Response) => {
        try {
            let command = new Repository.DeleteUserCommand(request.ActionUser);
            this.repository.Delete(command)
                .then(deletedUser => response.status(204).json(deletedUser))
                .catch(err => Errors.SendError(err, response));

        }
        catch (err) {
            Errors.SendError(err, response);
        }
    }

    private ReleaseAuthenticationToken = (request: express.Request, response: express.Response) => {
        console.log(`Get username ${request.body.username}`);
        this.repository.GetByUsername(request.body.username)
            .then(user => {

                try {
                    if (!user)
                        Errors.SendError(new Errors.InvalidCredentialErrors(), response);
                    else {
                        let command = new Repository.AuthenticateUserCommand(user, request.body.password);
                        response.json(this.tokenService.SignPayload(command.token));
                    }

                } catch (error) {
                    Errors.SendError(error, response);

                }
            })
            .catch(error => Errors.SendError(error, response));
    }

    private GetUserRoles = (request: IUserRequest, response: express.Response) => {
        let user: Repository.IUserModel = request.ActionUser || request.CallerUser;
        response.json(user.roles || []);
    }

    private GetUserApplications = (request: IUserRequest, response: express.Response) => {
        let user: Repository.IUserModel = request.ActionUser || request.CallerUser;
        response.json(user.applications || []);
    }

    // TOBE moved to dedicated service
    private GetRoles = (request: express.Request, response: express.Response) => {
        response.json(ShippingRoles);
    }
    private GetApplications = (request: express.Request, response: express.Response) => {
        response.json(ShippingApplications);
    }

}


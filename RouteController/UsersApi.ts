'use strict';
import * as express from 'express';
import { Server } from 'base-rest-service-container/build/Server';
import * as url from 'url';
import * as path from 'path';

import { IRoute } from 'base-rest-service-container/build/Route/IRoute'
import * as Repository from '../Model/UserRepository';
import { RepositoryQueryCommand } from 'base-mongodb-repository/build/RepositoryQuery';
import { RepositoryQueryResult } from 'base-mongodb-repository/build/RepositoryQueryResult';
import * as Errors from 'base-rest-service-container/build/Common/Exceptions';
import { TokenManagement, TokenPayload } from 'base-rest-service-container/build/Common/SecurityService';
import {ApplicationConfig} from 'base-rest-service-container/build/Config/ApplicationConfig';
import { ShippingApplications, ShippingRoles } from '../Model/AppAndPermissions';

/**
 * User
 */
export class UsersApi implements IRoute {
    private app :express.Application = null;
    private serverContainer:Server;
    private repository:Repository.UserRepository = new Repository.UserRepository(); 
    private tokenService:TokenManagement;
    constructor ( public path:string = '/api/users'){
        
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

        if (this.serverContainer.config.MustAuthenticateRequest()){
            router.use(TokenManagement.SecurityCheck);
        }
            

        router.get('/', this.Find);
        router.post('/', this.Add);
        router.get('/current', this.GetCurrent);
        router.get('/getbyusername', this.GetByUsername);     
        router.patch('/resetpassword', this.ResetUserPassword);   
        
        router.get('/getroles', this.GetRoles);
        router.get('/getapplications', this.GetApplications);

        router.get('/:id', this.Get);
        router.delete('/:id', this.Delete);
        router.patch('/:id/changepassword', this.ChangePassword);
        router.patch('/:id/changeemailaddress', this.ChangeEmailAddress);

        router.get('/:id/roles', this.GetUserRoles);
        router.post('/:id/roles', this.ChangeUserRoles);
        
        router.get('/:id/apps', this.GetUserApplications);
        router.post('/:id/apps', this.ChangeUserApplications);

        return router;
    }

    private Find = (request: express.Request, response: express.Response) => {
        let searchQuery = RepositoryQueryCommand.ParseRequest(request.query);
        searchQuery.sort = "username";
        
        this.repository.Find(searchQuery)
            .then(data => response.json(data))
            .catch(err => Errors.SendError(err, response));
    }

    private Get = (request: express.Request, response: express.Response, next: express.NextFunction) => {

        
        this.repository.Get(request.params.id)
            .then(data => {
                if (data)
                    response.json(data);
                else
                    Errors.SendError ( new Errors.EntitytNotFoundError(), response );
            })
            .catch(err => Errors.SendError(err, response));

    }
    
    private GetRoles = (request: express.Request, response: express.Response, next: express.NextFunction) => {
        response.json(ShippingRoles);
    }
    private GetApplications = (request: express.Request, response: express.Response, next: express.NextFunction) => {        
       response.json(ShippingApplications);        
    }
    
    private GetByUsername = (request:express.Request, response:express.Response, next: express.NextFunction) => {
        let token:TokenPayload = request['token'];
        try {
            if (!token) throw new Errors.EntitytNotFoundError();
            this.repository.GetByUsername(request.query.username)
                .then(user => {
                    if (user)
                        response.json(user);
                    else 
                        Errors.SendError ( new Errors.EntitytNotFoundError(), response);
                })  
                .catch(error => Errors.SendError(error, response));  
        } catch (error) {
            Errors.SendError(error, response);
        }
                    
            
    }

    private GetCurrent = (request:express.Request, response:express.Response, next: express.NextFunction) => {
        let token:TokenPayload = request['token'];
        try {
            if (!token) throw new Errors.EntitytNotFoundError();
            this.repository.GetByUsername(token.login)
                .then(user => {
                    if (user)
                        response.json(user);
                    else 
                        Errors.SendError ( new Errors.EntitytNotFoundError(), response);
                })  
                .catch(error => Errors.SendError(error, response));  
        } catch (error) {
            Errors.SendError(error, response);
        }
        
            
            
    }

    private Add = (request: express.Request, response: express.Response, next: express.NextFunction) => {

        try {
            let command:Repository.AddUserCommand = new Repository.AddUserCommand(request.body.username, request.body.password, request.body.password_confirm, request.body.email);
            let wapi = url.parse(request.url);
            
            this.repository.Add(command)
                .then(doc => {
                    response.header('Location', path.join(request.baseUrl, doc._id.toString()));
                    response.sendStatus(201);
                })
                .catch(err => Errors.SendError(err, response));

        } catch (error) {

            Errors.SendError(error, response)

        }


    }

    private ChangeEmailAddress = (request: express.Request, response: express.Response, next: express.NextFunction) => {

        this.repository.Get(request.params.id)
            .then(user => {
                try {
                    if (!user) throw new Errors.EntitytNotFoundError();

                    let command = new Repository.ChangeEmailAddressCommand(user, request.body.email_address);
                    this.repository.HandleChangeEmailAddress(command)
                        .then(user => response.status(200).json(user))
                        .catch(err => Errors.SendError(err, response));

                } catch (error) {
                    Errors.SendError(error, response);
                }

            })
            .catch(err => Errors.SendError(err, response));

    }

    private GetUserRoles = (request: express.Request, response: express.Response, next: express.NextFunction) => {
        this.repository.Get(request.params.id)
            .then(data => {
                if (data)
                    response.json(data.roles || []);
                else
                    Errors.SendError ( new Errors.EntitytNotFoundError(), response );
            })
            .catch(err => Errors.SendError(err, response));
    }

    private ChangeUserRoles = (request: express.Request, response: express.Response, next: express.NextFunction) => {
                
        try {
            let token:TokenPayload = request['token'];            
            if (!token || !token.IsInRole('admin')) throw new Errors.NotAuthorizedError();
            
            this.repository.Get(request.params.id)
                .then(user => {
                    let command = new Repository.ChangeUserRolesCommand(user, request.body.roles);
                    
                    this.repository.Save(command)
                        .then(doc => response.status(200).json(doc))
                        .catch(error => Errors.SendError(error, response));
                        
                })
                .catch(error => Errors.SendError(error, response)); 
                                   
        } catch (error) {
            Errors.SendError(error, response)
        }
    }
    
    private GetUserApplications = (request:express.Request, response:express.Response, next:express.NextFunction) => {
        this.repository.Get(request.params.id)
            .then(data => {
                if (data)
                    response.json(data.applications || []);
                else
                    Errors.SendError ( new Errors.EntitytNotFoundError(), response );
            })
            .catch(err => Errors.SendError(err, response));
        
    }

    private ChangeUserApplications = (request:express.Request, response:express.Response, next:express.NextFunction) => {
        try {
            let token:TokenPayload = request['token'];
            if (!token || token.IsInRole('admin')) throw new Errors.NotAuthorizedError();
            
            this.repository.Get(request.params.id)
                .then(user => {
                    let command = new Repository.ChangeUserApplicationsCommand(user, request.body.applications);
                    this.repository.Save(command)
                        .then(doc => response.status(200).json(doc))
                        .catch(error => Errors.SendError(error, response));
                })
                .catch(error => Errors.SendError(error, response)); 
                                   
        } catch (error) {
            Errors.SendError(error, response)
        }
    }

    private ChangePassword = (request: express.Request, response: express.Response, next: express.NextFunction) => {

        this.repository.Get(request.params.id)
            .then(user => {
                try {
                    if (!user) throw new Errors.EntitytNotFoundError();

                    let command = new Repository.ChangePasswordCommand(user, request.body.oldpassword, request.body.password, request.body.password_confirm);
                    this.repository.HandleChangePassword(command)
                        .then(user => response.sendStatus(200))
                        .catch(err => Errors.SendError(err, response));

                } catch (error) {
                    Errors.SendError(error, response);
                }

            })
            .catch(err => Errors.SendError(err, response));

    }
    
    private ResetUserPassword =  (request: express.Request, response: express.Response, next: express.NextFunction) => {
        let token: TokenPayload = <TokenPayload> request['token'];
        try {
            if (!token) throw new Errors.NotAuthenticatedError();
            if (!token.IsInRole('admin')) throw new Errors.NotAuthorizedError();
            
            this.repository.GetByUsername(request.body.username)
                .then( user => {
                    let command = new Repository.ResetPassword(user, request.body.password, request.body.password_confirm);
                    this.repository.Save(command)
                        .then( user => response.sendStatus(200))
                        .catch( error => Errors.SendError(error, response));
                })
                .catch( error => Errors.SendError(error, response));
            
        } catch (error) {
            Errors.SendError(error, response);
        }
    }

    private Delete = (request: express.Request, response: express.Response, next: express.NextFunction) => {
        this.repository.Get(request.params.id)
            .then(doc =>{
                try {
                    if (!doc) throw new Errors.EntitytNotFoundError();
                    let command = new Repository.DeleteUserCommand(doc);
                    
                    this.repository.Delete(command)
                        .then( deletedUser => response.json(deletedUser))
                        .catch( err => Errors.SendError(err, response));                    
                    
                } catch (error) {
                    Errors.SendError(error, response)
                }    
            })
            .catch(err => Errors.SendError(err, response));
    }

    private ReleaseAuthenticationToken = (request: express.Request, response: express.Response, next: express.NextFunction) => {
        console.log(`Get username ${request.body.username}`);
        this.repository.GetByUsername(request.body.username)
            .then(user => {

                try {
                    if (!user) 
                        Errors.SendError(new Errors.InvalidCredentialErrors(), response);
                    else {
                        let command = new Repository.AuthenticateUserCommand(user, request.body.password);                                                
                        response.json( this.tokenService.SignPayload(command.token) );                        
                    }

                } catch (error) {
                    Errors.SendError(error, response);

                }
            })
            .catch(error => Errors.SendError(error, response));
    }

}

